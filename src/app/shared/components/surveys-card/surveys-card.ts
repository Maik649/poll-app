import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
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
  
export class SurveysCard implements OnInit {
  private surveyService = inject(SurveyService);
  private cdr = inject(ChangeDetectorRef);

  surveys: Surveys[] = [];
  isLoading = true;
  loadError = '';

  ngOnInit(): void {
    void this.loadSurveys();
  }

  private async loadSurveys(): Promise<void> {
    try {
      this.surveys = await this.surveyService.getSurveys();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.loadError = `Umfragen konnten nicht geladen werden: ${message}`;
      console.error('Fehler beim Laden der Umfragen:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  get topUrgentSurveys(): Surveys[] {
    return this.surveys
      .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      .slice(0, 3);
  }

  daysUntilEnd(endDate: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return 'Abgelaufen';
    if (diff === 0) return 'Endet heute';
    if (diff === 1) return 'Endet in 1 Tag';
    return `Ends in ${diff} Days`;
  }

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
