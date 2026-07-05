/**
 * @file Global workspace search across channels, members and messages.
 * Firestore offers no text search, so accessible messages are fetched on
 * demand and filtered client-side (documented trade-off in CLAUDE.md).
 */
import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';

import { MessageDoc } from '../models/message.model';
import { DirectMessageDoc } from '../models/direct-message.model';
import { AuthService } from './auth.service';
import { ChannelService } from './channel.service';
import { UserService } from './user.service';

const MAX_GROUP_RESULTS = 5;
const MAX_MESSAGE_RESULTS = 10;
const SNIPPET_LENGTH = 80;
const UNKNOWN_USER = 'Unbekannt';

/** Channel search hit. */
export interface ChannelHit {
  readonly kind: 'channel';
  readonly id: string;
  readonly name: string;
}

/** Member search hit. */
export interface UserHit {
  readonly kind: 'user';
  readonly uid: string;
  readonly name: string;
  readonly username: string;
  readonly avatarPath: string;
}

/** Message search hit with its navigation context. */
export interface MessageHit {
  readonly kind: 'message';
  readonly id: string;
  readonly snippet: string;
  readonly authorName: string;
  readonly contextLabel: string;
  readonly route: string[];
}

/** Grouped search results. */
export interface SearchResults {
  readonly channels: ChannelHit[];
  readonly users: UserHit[];
  readonly messages: MessageHit[];
}

/**
 * Searches the workspace within the user's privacy scope: channel and
 * member lookups cover the visible streams, message search covers only
 * channels the user is a member of and the user's own conversations.
 * Thread replies are excluded from the scope for now.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly channelService = inject(ChannelService);

  private readonly userService = inject(UserService);

  private readonly injector = inject(EnvironmentInjector);


  /**
   * Runs the grouped search for a term, dispatching by the scope prefix
   * ("#" channels, "@" users, otherwise everything).
   * @param term Raw search term (min length enforced by the caller).
   */
  async search(term: string): Promise<SearchResults> {
    const raw = term.trim();
    const normalized = raw.toLowerCase();
    if (raw.startsWith('#')) return this.channelScope(normalized.slice(1).trim());
    if (raw.startsWith('@')) return this.userScope(normalized.slice(1).trim());
    return this.fullScope(normalized);
  }


  /**
   * Channel-only results for a "#"-scoped query.
   * @param query Normalized query without the prefix.
   */
  private channelScope(query: string): SearchResults {
    return { channels: this.searchChannels(query), users: [], messages: [] };
  }


  /**
   * User-only results for an "@"-scoped query.
   * @param query Normalized query without the prefix.
   */
  private userScope(query: string): SearchResults {
    return { channels: [], users: this.searchUsers(query), messages: [] };
  }


  /**
   * Combined channel, user and message results for an unscoped query.
   * @param query Normalized query.
   */
  private async fullScope(query: string): Promise<SearchResults> {
    return {
      channels: this.searchChannels(query),
      users: this.searchUsers(query),
      messages: await this.searchMessages(query),
    };
  }


  /**
   * Filters the user's channels by name and description.
   * @param term Normalized search term.
   */
  private searchChannels(term: string): ChannelHit[] {
    return this.channelService
      .channels()
      .filter(
        channel =>
          channel.name.toLowerCase().includes(term) ||
          channel.description.toLowerCase().includes(term),
      )
      .slice(0, MAX_GROUP_RESULTS)
      .map(channel => ({ kind: 'channel', id: channel.id, name: channel.name }));
  }


  /**
   * Filters workspace users by display name and e-mail (substring) and by
   * the normalized immutable username (prefix).
   * @param term Normalized search term.
   */
  private searchUsers(term: string): UserHit[] {
    return this.userService
      .users()
      .filter(
        user =>
          user.name.toLowerCase().includes(term) ||
          (user.email ?? '').toLowerCase().includes(term) ||
          (user.username ?? '').startsWith(term),
      )
      .slice(0, MAX_GROUP_RESULTS)
      .map(user => ({
        kind: 'user',
        uid: user.uid,
        name: user.name,
        username: user.username ?? '',
        avatarPath: user.avatarPath,
      }));
  }


  /**
   * Searches messages in member channels and own conversations.
   * @param term Normalized search term.
   */
  private async searchMessages(term: string): Promise<MessageHit[]> {
    const hits: MessageHit[] = [];
    for (const channel of this.channelService.channels()) {
      if (hits.length >= MAX_MESSAGE_RESULTS) break;
      const path = `channels/${channel.id}/messages`;
      const route = ['/app/channel', channel.id];
      hits.push(...(await this.collectHits(path, term, `# ${channel.name}`, route)));
    }
    hits.push(...(await this.searchConversations(term, hits.length)));
    return hits.slice(0, MAX_MESSAGE_RESULTS);
  }


  /**
   * Searches the signed-in user's direct conversations.
   * @param term Normalized search term.
   * @param found Number of hits collected so far.
   */
  private async searchConversations(term: string, found: number): Promise<MessageHit[]> {
    if (found >= MAX_MESSAGE_RESULTS) return [];
    const uid = this.authService.requireUid();
    const conversations = await this.inContext(() =>
      getDocs(query(collection(this.firestore, 'directMessages'), where('participantIds', 'array-contains', uid))),
    );
    const hits: MessageHit[] = [];
    for (const conversation of conversations.docs) {
      const partnerUid = resolvePartnerUid(conversation.data() as DirectMessageDoc, uid);
      const partnerName = this.userName(partnerUid);
      const route = ['/app/dm', partnerUid];
      hits.push(...(await this.collectHits(`${conversation.ref.path}/messages`, term, partnerName, route)));
    }
    return hits;
  }


  /**
   * Fetches one messages collection and filters it client-side.
   * @param path Firestore path of the messages collection.
   * @param term Normalized search term.
   * @param contextLabel Source label shown in the result row.
   * @param route Router commands navigating to the source.
   */
  private async collectHits(
    path: string,
    term: string,
    contextLabel: string,
    route: string[],
  ): Promise<MessageHit[]> {
    const uid = this.authService.requireUid();
    const snapshot = await this.inContext(() => getDocs(collection(this.firestore, path)));
    return snapshot.docs
      .filter(docSnapshot => matchesTerm(docSnapshot.data() as MessageDoc, term, uid))
      .map(docSnapshot => ({
        kind: 'message' as const,
        id: docSnapshot.id,
        snippet: snippetOf((docSnapshot.data() as MessageDoc).text),
        authorName: this.userName((docSnapshot.data() as MessageDoc).authorId),
        contextLabel,
        route,
      }));
  }


  /**
   * Resolves a user's display name from the live stream.
   * @param uid Uid to resolve.
   */
  private userName(uid: string): string {
    return this.userService.users().find(user => user.uid === uid)?.name ?? UNKNOWN_USER;
  }


  /**
   * Runs a Firebase API call in the injection context.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}


/**
 * Reports whether a visible message matches the term.
 * @param message Message document data.
 * @param term Normalized search term.
 * @param uid Uid of the searching user (hidden messages are excluded).
 */
function matchesTerm(message: MessageDoc, term: string, uid: string): boolean {
  if (message.deletedAt || message.hiddenFor?.includes(uid)) return false;
  return message.text.toLowerCase().includes(term);
}


/**
 * Shortens a message text for the result row.
 * @param text Full message text.
 */
function snippetOf(text: string): string {
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text;
}


/**
 * Resolves the conversation partner; the self conversation maps to the
 * own uid.
 * @param conversation Conversation document data.
 * @param uid Uid of the searching user.
 */
function resolvePartnerUid(conversation: DirectMessageDoc, uid: string): string {
  return conversation.participantIds.find(participant => participant !== uid) ?? uid;
}
