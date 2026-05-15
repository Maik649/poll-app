import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Surveys } from '../surveys';
import { SurveyService } from '../../services/survey.service';

type SurveyStatusFilter = 'all' | 'active' | 'past';

@Component({
  selector: 'app-all-surveys-section',
  imports: [CommonModule, RouterLink],
  templateUrl: './all-surveys-section.html',
  styleUrl: './all-surveys-section.scss',
})
export class AllSurveysSection implements OnInit {
  private surveyService = inject(SurveyService);
  private cdr = inject(ChangeDetectorRef);

  surveys: Surveys[] = [];
  isLoading = true;
  loadError = '';

  statusFilter: SurveyStatusFilter = 'all';
  selectedCategory = 'all';

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

  get categories(): string[] {
    const unique = new Set(
      this.surveys
        .map((survey) => survey.category?.trim())
        .filter((category): category is string => Boolean(category))
    );

    return [...unique].sort((a, b) => a.localeCompare(b));
  }

  get filteredSurveys(): Surveys[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.surveys
      .filter((survey) => {
        const end = new Date(survey.endDate);
        end.setHours(0, 0, 0, 0);

        if (Number.isNaN(end.getTime())) {
          return false;
        }

        if (this.statusFilter === 'all') {
          return true;
        }

        return this.statusFilter === 'active' ? end >= today : end < today;
      })
      .filter((survey) => this.selectedCategory === 'all' || survey.category === this.selectedCategory)
      .sort((a, b) => {
        const byCategory = (a.category ?? '').localeCompare(b.category ?? '');
        if (byCategory !== 0) {
          return byCategory;
        }

        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      });
  }

  setStatusFilter(status: SurveyStatusFilter): void {
    this.statusFilter = status;
  }

  updateCategory(category: string): void {
    this.selectedCategory = category;
  }

  daysUntilEnd(endDate: string): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) {
      return 'Abgelaufen';
    }

    if (diff === 0) {
      return 'Endet heute';
    }

    if (diff === 1) {
      return 'Endet in 1 Tag';
    }

    return `Endet in ${diff} Tagen`;
  }
}
