import { Component } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { SurveysSection } from "../surveys-section/surveys-section";
import { SurveyForm } from '../survey-form/survey-form';
import { CommonModule } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-hero-secton',
  imports: [CommonModule, SurveysSection, RouterLink, SurveyForm],
  templateUrl: './hero-secton.html',
  styleUrl: './hero-secton.scss',
})
/** Hosts the landing section and controls the create-survey dialog state. */
export class HeroSecton {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /**
   * Returns whether the create-survey dialog route is currently active.
   * @returns True when dialog route is active.
   */
  get isCreateDialogOpen(): boolean {
    return this.router.url.startsWith('/umfrage-erstellen');
  }

  /**
   * Applies body scroll locking when the component initializes.
   * @returns void
   */
  ngOnInit(): void {
    this.updateBodyScroll(this.isCreateDialogOpen);
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.updateBodyScroll(this.isCreateDialogOpen);
      });
  }

  /**
   * Restores body scrolling when the component is destroyed.
   * @returns void
   */
  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  /**
   * Updates document scroll behavior while the dialog is open.
   * @param isOpen True when dialog is open.
   * @returns void
   */
  private updateBodyScroll(isOpen: boolean): void {
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
  
  /**
   * Closes the create-survey dialog by navigating back to the home route.
   * @returns void
   */
  closeCreateDialog(): void {
    this.updateBodyScroll(false);
    void this.router.navigate(['/']);
  }

  /**
   * Prevents the native dialog cancel behavior and closes through routing.
   * @param event Cancel event emitted by the dialog.
   * @returns void
   */
  onDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeCreateDialog();
  }
}
