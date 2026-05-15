import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit, OnDestroy {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private routeSubscription: Subscription | null = null;

  showCreateSurveyButton = false;

  ngOnInit(): void {
    this.updateButtonVisibility(this.router.url);

    this.routeSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateButtonVisibility(event.urlAfterRedirects);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  private updateButtonVisibility(url: string): void {
    this.showCreateSurveyButton = url.startsWith('/umfrage/');
    this.cdr.detectChanges();
  }
}
