import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Surveys } from '../surveys';
import { SurveyService } from '../../services/survey.service';

/** Describes the available status filters for the survey list. */
type SurveyStatusFilter = 'all' | 'active' | 'past';

@Component({
  selector: 'app-all-surveys-section',
  imports: [CommonModule, RouterLink],
  templateUrl: './all-surveys-section.html',
  styleUrl: './all-surveys-section.scss',
})
/** Displays the full survey list with status and category filtering. */
export class AllSurveysSection implements OnInit {
  private surveyService = inject(SurveyService);
  private cdr = inject(ChangeDetectorRef);

  surveys: Surveys[] = [];
  isLoading = true;
  loadError = '';
  statusFilter: SurveyStatusFilter = 'all';
  selectedCategory = 'all';
  isCategoryMenuOpen = false;

  /**
   * Loads surveys once the component is initialized.
   * @returns void
   */
  ngOnInit(): void {
    void this.loadSurveys();
  }

  /**
   * Loads survey data and updates loading state.
   * @returns Promise resolved after load cycle.
   */
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

  /**
   * Returns available categories extracted from all surveys.
   * @returns Sorted unique category list.
   */
  get categories(): string[] {
    const unique = new Set(this.surveys.map((survey) => survey.category?.trim()).filter(Boolean) as string[]);
    return [...unique].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Returns surveys filtered by status and category and then sorted.
   * @returns Filtered and sorted surveys.
   */
  get filteredSurveys(): Surveys[] {
    const today = this.normalizeDate(new Date());
    return this.surveys
      .filter((survey) => this.matchesStatusFilter(survey, today))
      .filter((survey) => this.matchesCategoryFilter(survey))
      .sort((a, b) => this.compareByCategoryAndEnd(a, b));
  }

  /**
   * Updates the selected status tab filter.
   * @param status New status filter value.
   * @returns void
   */
  setStatusFilter(status: SurveyStatusFilter): void {
    this.statusFilter = status;
  }

  /**
   * Applies the selected category filter and closes the dropdown.
   * @param category Selected category label.
   * @returns void
   */
  updateCategory(category: string): void {
    this.selectedCategory = category;
    this.isCategoryMenuOpen = false;
  }

  /**
   * Toggles category menu visibility.
   * @returns void
   */
  toggleCategoryMenu(): void {
    this.isCategoryMenuOpen = !this.isCategoryMenuOpen;
  }

  /**
   * Closes the category menu.
   * @returns void
   */
  closeCategoryMenu(): void {
    this.isCategoryMenuOpen = false;
  }

  /**
   * Returns selected category label for UI text.
   * @returns Category label shown in the UI.
   */
  get selectedCategoryLabel(): string {
    return this.selectedCategory === 'all' ? 'All categories' : this.selectedCategory;
  }

  /**
   * Returns a localized relative end-date label.
   * @param endDate Survey end date value.
   * @returns Relative status text.
   */
  daysUntilEnd(endDate: string): string {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Abgelaufen';
    if (diff === 0) return 'Endet heute';
    if (diff === 1) return 'Endet in 1 Tag';
    return `Endet in ${diff} Tagen`;
  }

  /**
   * Checks whether a survey end date is in the past.
   * @param endDate Survey end date value.
   * @returns True when expired.
   */
  isSurveyExpired(endDate: string): boolean {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    if (Number.isNaN(end.getTime())) return true;
    return end < today;
  }

  /**
   * Checks whether a survey passes the selected status filter.
   * @param survey Survey to evaluate.
   * @param today Reference date normalized to midnight.
   * @returns True when the survey matches the selected status filter.
   */
  private matchesStatusFilter(survey: Surveys, today: Date): boolean {
    const end = this.normalizeDate(new Date(survey.endDate));
    if (Number.isNaN(end.getTime())) return false;
    if (this.statusFilter === 'all') return true;
    return this.statusFilter === 'active' ? end >= today : end < today;
  }

  /**
   * Checks whether a survey matches the selected category filter.
   * @param survey Survey to evaluate.
   * @returns True when category matches.
   */
  private matchesCategoryFilter(survey: Surveys): boolean {
    return this.selectedCategory === 'all' || survey.category === this.selectedCategory;
  }

  /**
   * Sorts surveys by category and then by end date.
   * @param a Left survey entry.
   * @param b Right survey entry.
   * @returns Negative/zero/positive sort value.
   */
  private compareByCategoryAndEnd(a: Surveys, b: Surveys): number {
    const byCategory = (a.category ?? '').localeCompare(b.category ?? '');
    if (byCategory !== 0) return byCategory;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  }

  /**
   * Normalizes a date to midnight for day-level comparisons.
   * @param date Date instance to normalize.
   * @returns The same normalized date instance.
   */
  private normalizeDate(date: Date): Date {
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
