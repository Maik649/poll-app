import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Surveys } from '../surveys';
import { CommonModule } from '@angular/common';
import { SurveyService } from '../../services/survey.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-surveys-card',
  imports: [CommonModule, RouterLink],
  templateUrl: './surveys-card.html',
  styleUrl: './surveys-card.scss',
})
/** Highlights a short list of urgent active surveys on the landing page. */
export class SurveysCard implements OnInit {
  private surveyService = inject(SurveyService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  surveys: Surveys[] = [];
  isLoading = true;
  loadError = '';

  /**
   * Loads surveys once the component is initialized.
   * @returns void
   */
  ngOnInit(): void {
    void this.loadSurveys();
    this.surveyService.surveysChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadSurveys();
      });
  }

  /**
   * Loads all surveys for the card section and handles load state.
   * @returns Promise resolved after load cycle.
   */
  private async loadSurveys(): Promise<void> {
    this.isLoading = true;
    this.loadError = '';
    try {
      this.surveys = await this.surveyService.getSurveys();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.loadError = `Umfragen konnten nicht geladen werden: ${message}`;
      console.error('Fehler beim Laden der Umfragen:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Returns the top 3 active surveys ordered by nearest end date.
   * @returns Up to three active surveys ordered by urgency.
   */
  get topUrgentSurveys(): Surveys[] {
    return this.surveys
      .filter((survey) => !this.isSurveyExpired(survey.endDate))
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      .slice(0, 3);
  }

  /**
   * Checks whether a survey is expired or date is invalid.
   * @param endDate Survey end date value.
   * @returns True when survey is expired.
   */
  isSurveyExpired(endDate: string): boolean {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    if (Number.isNaN(end.getTime())) return true;
    return end < today;
  }

  /**
   * Returns localized text for remaining days until end date.
   * @param endDate Survey end date value.
   * @returns Relative remaining-time label.
   */
  daysUntilEnd(endDate: string): string {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Abgelaufen';
    if (diff === 0) return 'Endet heute';
    if (diff === 1) return 'Endet in 1 Tag';
    return `Ends in ${diff} Days`;
  }

  /**
   * Normalizes a date to local midnight for date-only checks.
   * @param date Date instance to normalize.
   * @returns The normalized date instance.
   */
  private normalizeDate(date: Date): Date {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Formats a date using de-DE locale.
   * @param dateValue Input date string.
   * @returns Localized date label or fallback value.
   */
  formatDate(dateValue: string): string {
    if (!dateValue) {
      return '-';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return new Intl.DateTimeFormat('de-DE').format(date);
  }
}
