/**
 * @file Click-to-play YouTube embed below a message's text: a static
 * thumbnail facade (i.ytimg.com — the only YouTube request before the click)
 * that swaps to a youtube-nocookie.com iframe on activation. Renders nothing
 * when the message has no YouTube URL or the thumbnail fails to load (the
 * text keeps its plain link either way).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { YoutubeVideo, firstYoutubeVideo } from './youtube-url';

const THUMBNAIL_BASE = 'https://i.ytimg.com/vi';

const THUMBNAIL_RENDITION = 'hqdefault.jpg';

const EMBED_BASE = 'https://www.youtube-nocookie.com/embed';

const IFRAME_TITLE = 'YouTube-Video';

/**
 * Facade-first YouTube player. The 16:9 box is fixed-size (CLS 0); only the
 * lazy thumbnail loads before the user activates playback, keeping
 * third-party requests (and Best Practices audits) clean.
 */
@Component({
  selector: 'app-youtube-embed',
  templateUrl: './youtube-embed.component.html',
  styleUrl: './youtube-embed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YoutubeEmbedComponent {
  readonly text = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly video = computed(() => firstYoutubeVideo(this.text()));

  protected readonly isActive = signal(false);

  protected readonly thumbFailed = signal(false);

  protected readonly iframeTitle = IFRAME_TITLE;

  protected readonly thumbUrl = computed(() => {
    const video = this.video();
    return video ? `${THUMBNAIL_BASE}/${video.videoId}/${THUMBNAIL_RENDITION}` : '';
  });

  protected readonly frameSrc = computed<SafeResourceUrl | null>(() => {
    const video = this.video();
    if (!video || !this.isActive()) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl(video));
  });


  /**
   * Resets playback and thumbnail state whenever the message text (and with
   * it the detected video) changes, e.g. after an edit.
   */
  constructor() {
    effect(() => {
      this.video();
      this.isActive.set(false);
      this.thumbFailed.set(false);
    });
  }


  /** Activates playback: the facade swaps to the autoplaying iframe. */
  protected activate(): void {
    this.isActive.set(true);
  }
}


/**
 * Builds the privacy-enhanced embed URL with autoplay and the optional start
 * offset. Safe to trust as a resource URL: the id is validated to the strict
 * 11-character alphabet and the offset is numeric.
 * @param video Detected video reference.
 */
function embedUrl(video: YoutubeVideo): string {
  const start = video.startSeconds ? `&start=${video.startSeconds}` : '';
  return `${EMBED_BASE}/${video.videoId}?autoplay=1${start}`;
}
