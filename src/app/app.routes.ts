/**
 * @file Application route table with lazy-loaded standalone components.
 */
import { Routes } from '@angular/router';

import { authGuard, unauthGuard, verifyEmailGuard } from './guards/auth.guard';
import { registrationFormGuard } from './guards/registration-form.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shared/auth-layout/auth-layout.component').then(m => m.AuthLayoutComponent),
    children: [
      { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
      {
        path: 'auth',
        children: [
          {
            path: 'login',
            canActivate: [unauthGuard],
            loadComponent: () =>
              import('./features/auth/login/login.component').then(m => m.LoginComponent),
          },
          {
            path: 'register',
            canActivate: [unauthGuard],
            loadComponent: () =>
              import('./features/auth/register/register.component').then(m => m.RegisterComponent),
          },
          {
            path: 'register/avatar',
            canActivate: [registrationFormGuard],
            loadComponent: () =>
              import('./features/auth/avatar-picker/avatar-picker.component').then(
                m => m.AvatarPickerComponent,
              ),
          },
          {
            path: 'verify-email',
            canActivate: [verifyEmailGuard],
            loadComponent: () =>
              import('./features/auth/verify-email/verify-email.component').then(
                m => m.VerifyEmailComponent,
              ),
          },
          {
            path: 'forgot-password',
            canActivate: [unauthGuard],
            loadComponent: () =>
              import('./features/auth/forgot-password/forgot-password.component').then(
                m => m.ForgotPasswordComponent,
              ),
          },
          {
            path: 'reset-password',
            loadComponent: () =>
              import('./features/auth/reset-password/reset-password.component').then(
                m => m.ResetPasswordComponent,
              ),
          },
          {
            path: 'action',
            loadComponent: () =>
              import('./features/auth/auth-action/auth-action.component').then(
                m => m.AuthActionComponent,
              ),
          },
        ],
      },
      {
        path: 'invite/:token',
        loadComponent: () =>
          import('./features/invite/invite-redeem/invite-redeem.component').then(
            m => m.InviteRedeemComponent,
          ),
      },
      {
        path: 'impressum',
        loadComponent: () =>
          import('./features/legal/legal-notice/legal-notice.component').then(
            m => m.LegalNoticeComponent,
          ),
      },
      {
        path: 'datenschutz',
        loadComponent: () =>
          import('./features/legal/privacy-policy/privacy-policy.component').then(
            m => m.PrivacyPolicyComponent,
          ),
      },
      { path: 'legal/imprint', redirectTo: 'impressum', pathMatch: 'full' },
      { path: 'legal/privacy', redirectTo: 'datenschutz', pathMatch: 'full' },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat/app-shell/app-shell.component').then(m => m.AppShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/chat/channel-redirect/channel-redirect.component').then(
            m => m.ChannelRedirectComponent,
          ),
      },
      {
        path: 'channel/:channelId',
        loadComponent: () =>
          import('./features/chat/channel-view/channel-view.component').then(
            m => m.ChannelViewComponent,
          ),
      },
      {
        path: 'dm/:uid',
        loadComponent: () =>
          import('./features/chat/direct-message-view/direct-message-view.component').then(
            m => m.DirectMessageViewComponent,
          ),
      },
      {
        path: 'new-message',
        loadComponent: () =>
          import('./features/chat/new-message/new-message.component').then(
            m => m.NewMessageComponent,
          ),
      },
      {
        path: 'friends',
        loadComponent: () =>
          import('./features/friends/friends-view/friends-view.component').then(
            m => m.FriendsViewComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'auth/login' },
];
