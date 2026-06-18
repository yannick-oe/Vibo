/**
 * @file Application root component hosting the router outlet and toast overlay.
 */
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastComponent } from './shared/toast/toast.component';

/**
 * Root shell rendering the active route and the global toast region.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastComponent],
  template: '<router-outlet /><app-toast />',
})
export class App {}
