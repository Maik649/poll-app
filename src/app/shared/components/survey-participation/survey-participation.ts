import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SurveyService, SurveySubmission } from '../../services/survey.service';
import { Surveys } from '../surveys';

@Component({
  selector: 'app-survey-participation',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './survey-participation.html',
  styleUrl: './survey-participation.scss',
})
/** Handles vote submission and live result rendering for one survey. */
export class SurveyParticipation implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private surveyService = inject(SurveyService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private document = inject(DOCUMENT);

  survey: Surveys | null = null;
  surveyId: string | null = null;
  isLoading = true;
  loadError = '';
  submitError = '';
  submitSuccess = false;
  isSubmitting = false;
  voteCountsByAnswerId: Record<string, number> = {};
  voteTotalsByQuestionId: Record<string, number> = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  surveyForm = this.fb.group({
    questions: this.fb.array<FormControl<string[]>>([]),
  });

  /** Returns typed access to the dynamic question form array. */
  get questionsArray(): FormArray<FormControl<string[]>> {
    return this.surveyForm.get('questions') as FormArray<FormControl<string[]>>;
  }

  /** Initializes page styles, validates route id and loads survey data. */
  async ngOnInit(): Promise<void> {
    this.addPageClass();
    this.surveyId = this.route.snapshot.paramMap.get('id');

    if (!this.ensureSurveyId()) {
      this.finishInitialLoading();
      return;
    }

    await this.loadSurveyLifecycle();
    this.finishInitialLoading();
  }

  /** Cleans up page class and active polling timer. */
  ngOnDestroy(): void {
    this.document.body.classList.remove('survey-page');
    this.stopPolling();
  }

  /** Adds body class for participation page styling. */
  private addPageClass(): void {
    this.document.body.classList.add('survey-page');
  }

  /** Ensures a survey id exists and sets error when missing. */
  private ensureSurveyId(): boolean {
    if (this.surveyId) {
      return true;
    }

    this.loadError = 'Keine Umfrage-ID gefunden.';
    return false;
  }

  /** Loads survey, validates state and starts live updates. */
  private async loadSurveyLifecycle(): Promise<void> {
    try {
      const survey = await this.fetchSurvey();
      if (!survey || !this.prepareLoadedSurvey(survey)) {
        return;
      }

      await this.loadVoteCounts();
      this.startLivePolling();
    } catch (error: unknown) {
      this.setLoadError(error);
    }
  }

  /** Fetches a survey from backend by route id. */
  private async fetchSurvey(): Promise<Surveys | null> {
    if (!this.surveyId) {
      return null;
    }

    return this.surveyService.getSurveyById(this.surveyId);
  }

  /** Stores loaded survey and rejects expired entries. */
  private prepareLoadedSurvey(survey: Surveys): boolean {
    if (this.isSurveyExpired(survey.endDate)) {
      this.loadError = 'Diese Umfrage ist bereits abgelaufen und kann nicht mehr ausgefuellt werden.';
      return false;
    }

    this.survey = survey;
    this.buildForm(survey);
    return true;
  }

  /** Maps unknown load errors to a user-facing message. */
  private setLoadError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    this.loadError = `Umfrage konnte nicht geladen werden: ${message}`;
  }

  /** Finishes initial loading state and refreshes view. */
  private finishInitialLoading(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  /** Starts polling and replaces existing interval if needed. */
  private startLivePolling(): void {
    if (!this.surveyId) {
      return;
    }

    this.stopPolling();
    this.pollTimer = setInterval(() => void this.loadVoteCounts(), 5000);
  }

  /** Stops the current polling interval. */
  private stopPolling(): void {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Fetches current vote counts while keeping UI responsive. */
  private async loadVoteCounts(): Promise<void> {
    if (!this.surveyId) {
      return;
    }

    try {
      const counts = await this.surveyService.getSurveyVoteCounts(this.surveyId);
      this.voteCountsByAnswerId = counts.byAnswerId;
      this.voteTotalsByQuestionId = counts.byQuestionId;
    } catch {
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** Creates one required multi-select control per question. */
  private buildForm(survey: Surveys): void {
    this.questionsArray.clear();

    for (const _question of survey.ask) {
      this.questionsArray.push(this.createQuestionControl());
    }
  }

  /** Builds a default question control with required validator. */
  private createQuestionControl(): FormControl<string[]> {
    return this.fb.control<string[]>([], { nonNullable: true, validators: [Validators.required] });
  }

  /** Returns whether an answer is selected for a question index. */
  isAnswerChecked(questionIndex: number, answerText: string): boolean {
    const selectedAnswers = this.questionsArray.at(questionIndex).value;
    return selectedAnswers.includes(answerText);
  }

  /** Adds or removes an answer from the question selection. */
  toggleAnswer(questionIndex: number, answerText: string, checked: boolean): void {
    const control = this.questionsArray.at(questionIndex);
    const current = control.value;

    if (checked && !current.includes(answerText)) {
      control.setValue([...current, answerText]);
      return;
    }

    control.setValue(current.filter((answer) => answer !== answerText));
  }

  /** Converts answer index to alphabetical label. */
  answerLabel(answerIndex: number): string {
    return String.fromCharCode(65 + answerIndex);
  }

  /** Validates and submits survey vote, then redirects to home. */
  async submitSurvey(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.beginSubmit();

    try {
      await this.persistVote();
      await this.handleSuccessRedirect();
    } catch (error: unknown) {
      this.setSubmitError(error);
    } finally {
      this.finishSubmit();
    }
  }

  /** Checks submit preconditions and sets validation errors. */
  private canSubmit(): boolean {
    if (this.submitSuccess || this.isSubmitting) return false;

    if (this.surveyForm.invalid) {
      this.surveyForm.markAllAsTouched();
      return false;
    }

    if (this.hasSurveyContext()) return true;
    this.setMissingSurveyError();
    return false;
  }

  /** Checks whether survey and id are available for submission. */
  private hasSurveyContext(): boolean {
    return Boolean(this.surveyId && this.survey);
  }

  /** Sets submit error when survey context is missing. */
  private setMissingSurveyError(): void {
    this.submitError = 'Umfrage konnte nicht zugeordnet werden.';
  }

  /** Prepares submit state before API interaction. */
  private beginSubmit(): void {
    this.submitError = '';
    this.submitSuccess = false;
    this.isSubmitting = true;
  }

  /** Persists selected answers to backend. */
  private async persistVote(): Promise<void> {
    const payload = this.buildSubmissionPayload();
    await this.surveyService.submitSurveyVote(this.surveyId!, payload);
  }

  /** Sets success state and performs delayed home redirect. */
  private async handleSuccessRedirect(): Promise<void> {
    this.submitSuccess = true;
    await this.wait(2000);
    await this.router.navigate(['/']);
  }

  /** Wait helper used for transition timing. */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Maps unknown submit errors to user-facing text. */
  private setSubmitError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    this.submitError = `Abstimmung konnte nicht gespeichert werden: ${message}`;
  }

  /** Finalizes submit cycle and refreshes view. */
  private finishSubmit(): void {
    this.isSubmitting = false;
    this.cdr.detectChanges();
  }

  /** Builds API submission payload from selected answers. */
  private buildSubmissionPayload(): SurveySubmission[] {
    if (!this.survey) {
      return [];
    }

    return this.survey.ask
      .map((question, questionIndex) => ({
        questionId: question.id ?? '',
        answerIds: this.questionsArray.at(questionIndex).value,
      }))
      .filter((submission) => submission.questionId.length > 0 && submission.answerIds.length > 0);
  }

  /** Returns true when a question field has a visible validation error. */
  questionHasError(index: number): boolean {
    const control = this.questionsArray.at(index);
    return control.invalid && control.touched;
  }

  /** Returns localized relative end-date text for badges. */
  daysUntilEnd(endDate: string): string {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return 'Abgelaufen';
    if (diff === 0) return 'Endet heute';
    if (diff === 1) return 'Endet in 1 Tag';
    return `Endet in ${diff} Tagen`;
  }

  /** Checks whether a survey end date is already in the past. */
  isSurveyExpired(endDate: string): boolean {
    const today = this.normalizeDate(new Date());
    const end = this.normalizeDate(new Date(endDate));
    if (Number.isNaN(end.getTime())) return true;
    return end < today;
  }

  /** Normalizes a date to midnight for day-based comparisons. */
  private normalizeDate(date: Date): Date {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /** Formats date strings in de-DE locale. */
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

  /** Returns vote percentage for one answer within a question. */
  resultPercent(questionId: string | undefined, answerId: string | undefined): number {
    if (!questionId || !answerId) {
      return 0;
    }

    const questionTotal = this.voteTotalsByQuestionId[questionId] ?? 0;
    if (questionTotal === 0) {
      return 0;
    }

    const answerVotes = this.voteCountsByAnswerId[answerId] ?? 0;
    return Math.round((answerVotes / questionTotal) * 100);
  }

  /** Returns absolute vote count for an answer id. */
  resultVotes(answerId: string | undefined): number {
    if (!answerId) {
      return 0;
    }

    return this.voteCountsByAnswerId[answerId] ?? 0;
  }
}
