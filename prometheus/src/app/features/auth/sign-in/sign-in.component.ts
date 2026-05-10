import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.scss'],
})
export class SignInComponent implements OnInit {
  readonly signInForm = this.fb.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [true],
  });

  loading = false;
  error = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly authApi: AuthApiService,
    private readonly session: AuthSessionService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    if (!this.session.isAuthenticated()) return;
    if (this.session.currentUser) {
      this.router.navigate(['/workspace']);
      return;
    }

    this.session.restoreSession().subscribe({
      next: (active) => {
        if (active) this.router.navigate(['/workspace']);
      },
    });
  }

  submit(): void {
    if (this.signInForm.invalid || this.loading) {
      this.signInForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';
    const payload = this.signInForm.getRawValue() as {
      email: string;
      password: string;
      rememberMe: boolean;
    };

    this.authApi
      .signIn(payload)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: ({ token }) => {
          this.session.setToken(token, payload.rememberMe);
          this.session.hydrateFromToken();
          this.session.restoreSession().subscribe({
            next: () => this.router.navigate(['/workspace']),
            error: () => this.router.navigate(['/workspace']),
          });
        },
        error: (error) => {
          const backendMessage = Array.isArray(error?.error?.message)
            ? error.error.message.join(', ')
            : error?.error?.message;
          this.error = backendMessage || 'Sign in failed. Check the email and password.';
        },
      });
  }
}
