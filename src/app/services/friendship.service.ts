/**
 * @file Friendship graph access: the live stream of the signed-in user's
 * friendships, the request lifecycle (send, withdraw, accept, decline,
 * remove), reactive relationship lookups and the guest demo seeding.
 */
import {
  EnvironmentInjector,
  Injectable,
  Signal,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  DocumentReference,
  Firestore,
  collection,
  collectionData,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, tap } from 'rxjs';

import {
  FriendshipDoc,
  RelationshipState,
  buildFriendshipId,
} from '../models/friendship.model';
import { AuthService } from './auth.service';
import { tokenGatedStream } from './token-gated-stream';
import { environment } from '../../environments/environment';

const FRIENDSHIPS_COLLECTION = 'friendships';
const PARTICIPANTS_FIELD = 'participants';

const BLOCKABLE_STATES: readonly RelationshipState[] = [
  'friends',
  'pendingIncoming',
  'pendingOutgoing',
];

/**
 * Data access for friendships/{friendshipId}. All mutations are guarded by
 * the current relationship state, mirroring the Firestore rules, so a stale
 * UI action degrades to a no-op instead of a permission error.
 */
@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private readonly firestore = inject(Firestore);

  private readonly authService = inject(AuthService);

  private readonly injector = inject(EnvironmentInjector);

  private readonly loadedState = signal(false);

  readonly friendships = toSignal(this.streamFriendships(), {
    initialValue: [] as FriendshipDoc[],
  });

  /** Whether the friendship stream has delivered its first snapshot. */
  readonly loaded = this.loadedState.asReadonly();

  /** Uids of all accepted friends of the signed-in user. */
  readonly friendUids = computed(() => this.collectFriendUids());

  /** Uids of users whose friend requests are awaiting the own answer. */
  readonly pendingIncomingUids = computed(() => this.pendingPartners(false));

  /** Uids of users the signed-in user has open requests to. */
  readonly pendingOutgoingUids = computed(() => this.pendingPartners(true));

  /** Uids of users the signed-in user has blocked. */
  readonly blockedUids = computed(() => this.collectBlockedUids());


  /**
   * Reactive relationship of the signed-in user to another user, for UI
   * reuse (friend buttons, request badges, DM gating).
   * @param uid Uid of the other user.
   */
  relationshipState(uid: string): Signal<RelationshipState> {
    return computed(() => this.stateFor(uid));
  }


  /**
   * Sends a friend request to another user.
   * @param toUid Uid of the request recipient.
   */
  async sendRequest(toUid: string): Promise<void> {
    const me = this.authService.requireUid();
    if (toUid === me || this.stateFor(toUid) !== 'none') return;
    const document: FriendshipDoc = {
      participants: sortedPair(me, toUid),
      requestedBy: me,
      status: 'pending',
      createdAt: serverTimestamp(),
      respondedAt: null,
    };
    await this.inContext(() => setDoc(this.friendshipRef(me, toUid), document));
  }


  /**
   * Withdraws an own pending request (requester only).
   * @param toUid Uid of the request recipient.
   */
  async withdrawRequest(toUid: string): Promise<void> {
    if (this.stateFor(toUid) !== 'pendingOutgoing') return;
    await this.deleteFriendship(toUid);
  }


  /**
   * Accepts an incoming pending request (recipient only).
   * @param fromUid Uid of the requester.
   */
  async acceptRequest(fromUid: string): Promise<void> {
    if (this.stateFor(fromUid) !== 'pendingIncoming') return;
    const me = this.authService.requireUid();
    await this.inContext(() =>
      updateDoc(this.friendshipRef(me, fromUid), {
        status: 'accepted',
        respondedAt: serverTimestamp(),
      }),
    );
  }


  /**
   * Declines an incoming pending request (recipient only).
   * @param fromUid Uid of the requester.
   */
  async declineRequest(fromUid: string): Promise<void> {
    if (this.stateFor(fromUid) !== 'pendingIncoming') return;
    await this.deleteFriendship(fromUid);
  }


  /**
   * Removes an accepted friendship (either participant).
   * @param uid Uid of the friend to remove.
   */
  async removeFriend(uid: string): Promise<void> {
    if (this.stateFor(uid) !== 'friends') return;
    await this.deleteFriendship(uid);
  }


  /**
   * Blocks another user: flips the pending or accepted friendship to
   * 'blocked' with the signed-in user as the single blocker.
   * @param uid Uid of the user to block.
   */
  async blockUser(uid: string): Promise<void> {
    if (!BLOCKABLE_STATES.includes(this.stateFor(uid))) return;
    const me = this.authService.requireUid();
    await this.inContext(() =>
      updateDoc(this.friendshipRef(me, uid), {
        status: 'blocked',
        blockedBy: me,
        respondedAt: serverTimestamp(),
      }),
    );
  }


  /**
   * Unblocks a user the signed-in user has blocked, restoring the
   * friendship to 'accepted' (blocker only).
   * @param uid Uid of the blocked user.
   */
  async unblockUser(uid: string): Promise<void> {
    if (this.stateFor(uid) !== 'blockedByMe') return;
    const me = this.authService.requireUid();
    await this.inContext(() =>
      updateDoc(this.friendshipRef(me, uid), {
        status: 'accepted',
        blockedBy: deleteField(),
        respondedAt: serverTimestamp(),
      }),
    );
  }


  /**
   * Seeds the accepted demo friendship between the signed-in guest and the
   * founder account so the public demo never shows an empty social state.
   * Best effort: missing configuration or a rules rejection never breaks
   * the guest sign-in.
   */
  async ensureDemoFriendship(): Promise<void> {
    const founderUid = environment.founderUid;
    const me = this.authService.requireUid();
    if (!founderUid || founderUid === me) return;
    try {
      await this.seedDemoFriendship(me, founderUid);
    } catch {
      return;
    }
  }


  /**
   * Creates the accepted guest↔founder friendship if it does not exist.
   * @param guestUid Uid of the signed-in guest.
   * @param founderUid Uid of the founder account.
   */
  private async seedDemoFriendship(guestUid: string, founderUid: string): Promise<void> {
    const reference = this.friendshipRef(guestUid, founderUid);
    const snapshot = await this.inContext(() => getDoc(reference));
    if (snapshot.exists()) return;
    const document: FriendshipDoc = {
      participants: sortedPair(guestUid, founderUid),
      requestedBy: founderUid,
      status: 'accepted',
      createdAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    };
    await this.inContext(() => setDoc(reference, document));
  }


  /**
   * Deletes the friendship document with another user.
   * @param uid Uid of the other participant.
   */
  private deleteFriendship(uid: string): Promise<void> {
    const me = this.authService.requireUid();
    return this.inContext(() => deleteDoc(this.friendshipRef(me, uid)));
  }


  /**
   * Resolves the relationship state to another user from the live stream.
   * @param uid Uid of the other user.
   */
  private stateFor(uid: string): RelationshipState {
    const me = this.authService.currentUser()?.uid;
    if (!me || uid === me) return 'none';
    const match = this.friendships().find(
      f => f.participants.includes(uid) && f.participants.includes(me),
    );
    if (!match) return 'none';
    if (match.status === 'blocked') return match.blockedBy === me ? 'blockedByMe' : 'blockedMe';
    if (match.status === 'accepted') return 'friends';
    return match.requestedBy === me ? 'pendingOutgoing' : 'pendingIncoming';
  }


  /**
   * Collects the other participant of every friendship the signed-in user
   * has blocked (never the relationships where the other side blocked).
   */
  private collectBlockedUids(): string[] {
    const me = this.authService.currentUser()?.uid;
    if (!me) return [];
    return this.friendships()
      .filter(f => f.status === 'blocked' && f.blockedBy === me)
      .flatMap(f => f.participants)
      .filter(uid => uid !== me);
  }


  /**
   * Collects the other participant of every pending friendship, filtered
   * by request direction.
   * @param outgoing True for own requests, false for incoming ones.
   */
  private pendingPartners(outgoing: boolean): string[] {
    const me = this.authService.currentUser()?.uid;
    if (!me) return [];
    return this.friendships()
      .filter(f => f.status === 'pending' && (f.requestedBy === me) === outgoing)
      .flatMap(f => f.participants)
      .filter(uid => uid !== me);
  }


  /**
   * Collects the other participant of every accepted friendship.
   */
  private collectFriendUids(): ReadonlySet<string> {
    const me = this.authService.currentUser()?.uid;
    if (!me) return new Set();
    const partners = this.friendships()
      .filter(f => f.status === 'accepted')
      .flatMap(f => f.participants)
      .filter(uid => uid !== me);
    return new Set(partners);
  }


  /**
   * Builds the document reference of the friendship between two users.
   * @param uidA First participant uid.
   * @param uidB Second participant uid.
   */
  private friendshipRef(uidA: string, uidB: string): DocumentReference {
    const id = buildFriendshipId(uidA, uidB);
    return this.inContext(() => doc(this.firestore, `${FRIENDSHIPS_COLLECTION}/${id}`));
  }


  /**
   * Streams the signed-in user's friendships; emits an empty list while
   * signed out so the subscription never reads without permission.
   * Self-healing (see token-gated-stream.ts): an inner error degrades to
   * the empty list silently (marking the stream loaded, as before) and
   * re-subscribes on the next ID-token emission.
   */
  private streamFriendships(): Observable<FriendshipDoc[]> {
    return tokenGatedStream({
      source: this.authService.tokenChanges,
      gate: current => current.uid,
      empty: [] as FriendshipDoc[],
      build: current => runInInjectionContext(this.injector, () => this.queryFriendships(current.uid)),
      onError: () => this.loadedState.set(true),
    });
  }


  /**
   * Reads all friendships containing the given uid live; error recovery is
   * attached by the surrounding token-gated stream.
   * @param uid Uid whose friendships to stream.
   */
  private queryFriendships(uid: string): Observable<FriendshipDoc[]> {
    const friendshipsQuery = query(
      collection(this.firestore, FRIENDSHIPS_COLLECTION),
      where(PARTICIPANTS_FIELD, 'array-contains', uid),
    );
    return (collectionData(friendshipsQuery) as Observable<FriendshipDoc[]>).pipe(
      tap(() => this.loadedState.set(true)),
    );
  }


  /**
   * Runs a Firebase API call in the injection context as AngularFire requires.
   * @param operation Firebase call to execute.
   */
  private inContext<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}


/**
 * Sorts the two participant uids ascending, matching the id convention.
 * @param uidA First participant uid.
 * @param uidB Second participant uid.
 */
function sortedPair(uidA: string, uidB: string): [string, string] {
  return [uidA, uidB].sort() as [string, string];
}
