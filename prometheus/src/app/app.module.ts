import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ApiInterceptor } from './core/api/api.interceptor';
import { SignInComponent } from './features/auth/sign-in/sign-in.component';
import { SignUpComponent } from './features/auth/sign-up/sign-up.component';
import { AiMatchingConsoleComponent } from './features/workspace/ai-matching-console/ai-matching-console.component';
import { CompanySetupConsoleComponent } from './features/workspace/company-setup-console/company-setup-console.component';
import { MasterOnboardingConsoleComponent } from './features/workspace/master-onboarding-console/master-onboarding-console.component';
import { WorkspaceComponent } from './features/workspace/workspace.component';

@NgModule({
  declarations: [
    AppComponent,
    SignInComponent,
    SignUpComponent,
    AiMatchingConsoleComponent,
    CompanySetupConsoleComponent,
    MasterOnboardingConsoleComponent,
    WorkspaceComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
