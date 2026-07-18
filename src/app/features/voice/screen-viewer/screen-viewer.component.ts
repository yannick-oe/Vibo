/**
 * @file Screen-share viewer dialog: shows a remote participant's shared
 * screen in a large centered card (near-full bottom sheet on mobile) with
 * the sharer's name, a native-fullscreen button and close. The video sits
 * in a fixed 16:9 stage (CLS 0, object-fit contain); when the watched
 * share ends, the dialog closes itself with a German toast. The stream
 * comes straight from the peer connection — no server, no recording.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { VoiceConnectionService } from '../../../services/voice-connection.service';
import { VoiceRosterService } from '../../../services/voice-roster.service';
import { DialogShellComponent } from '../../../shared/dialog-shell/dialog-shell.component';
import { memberName } from '../voice-view.util';

const SHARE_ENDED_TOAST = 'Bildschirmübertragung beendet';

/**
 * Modal viewer of one remote screen share, opened from the roster screen
 * glyphs. Rendered by the app shell; closing (X, Escape, scrim, drag) and
 * the automatic close on stream end all emit the same closed event.
 */
@Component({
  selector: 'app-screen-viewer',
  imports: [DialogShellComponent],
  templateUrl: './screen-viewer.component.html',
  styleUrl: './screen-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenViewerComponent {
  private readonly connectionService = inject(VoiceConnectionService);

  private readonly rosterService = inject(VoiceRosterService);

  private readonly userService = inject(UserService);

  private readonly toastService = inject(ToastService);

  readonly sessionId = input.required<string>();

  readonly closed = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly fullscreenSupported: boolean = document.fullscreenEnabled;

  protected readonly stream = computed(
    () => this.connectionService.remoteScreens().get(this.sessionId()) ?? null,
  );

  protected readonly sharerName = computed(() => {
    const channel = this.connectionService.connectedChannel();
    const uid = channel
      ? this.rosterService
          .participantsOf(channel.id)
          .find(participant => participant.sessionId === this.sessionId())?.uid
      : undefined;
    return memberName(this.userService.users(), uid ?? '');
  });


  /**
   * Wires the stream into the video element and the self-close on a share
   * that ended while the viewer is open.
   */
  constructor() {
    effect(() => this.attachStream());
    effect(() => this.closeWhenEnded());
  }


  /**
   * Closes the viewer (X button, Escape, scrim).
   */
  protected close(): void {
    this.closed.emit();
  }


  /**
   * Requests native fullscreen on the video element; rejections (user
   * agent restrictions) are swallowed.
   */
  protected openFullscreen(): void {
    const video = this.video()?.nativeElement;
    if (!video || typeof video.requestFullscreen !== 'function') return;
    void video.requestFullscreen().catch(() => undefined);
  }


  /**
   * Binds the current stream to the rendered video element; play() is
   * kicked explicitly for strict autoplay policies (the stream is muted —
   * screen shares carry no audio this phase).
   */
  private attachStream(): void {
    const video = this.video()?.nativeElement;
    const stream = this.stream();
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }


  /**
   * Closes the viewer with the German toast once the watched stream is
   * gone (sharer stopped, left or lost the connection).
   */
  private closeWhenEnded(): void {
    if (this.stream() !== null) return;
    this.toastService.show(SHARE_ENDED_TOAST);
    this.closed.emit();
  }
}
