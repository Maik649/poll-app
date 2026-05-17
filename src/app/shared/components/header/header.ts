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
/** Displays the header and toggles actions based on the active route. */
export class Header implements OnInit, OnDestroy {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private routeSubscription: Subscription | null = null;

  showCreateSurveyButton = false;

  /** Subscribes to navigation changes and updates the header action state. */
  ngOnInit(): void {
    this.updateButtonVisibility(this.router.url);

    this.routeSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateButtonVisibility(event.urlAfterRedirects);
      }
    });
  }

  /** Releases the route subscription when the header is destroyed. */
  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  /** Computes whether the create-survey shortcut should be visible. */
  private updateButtonVisibility(url: string): void {
    this.showCreateSurveyButton = url.startsWith('/umfrage/');
    this.cdr.detectChanges();
  }
}
