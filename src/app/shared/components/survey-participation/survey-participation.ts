import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SurveyService, SurveySubmission } from '../../services/survey.service';
import { Surveys } from '../surveys';
import {
  buildAnswerLabel,
  buildQuestionSelectionForm,
  buildSurveySubmissionPayload,
  buildUnknownErrorMessage,
  calcResultPercent,
  ensureSurveyIdOrError,
  formatDateDe,
  getDraftSelectionForQuestion,
  hasVoteLockForSurvey,
  storeVoteLockForSurvey,
  surveyIsExpired,
  voteLockKeyForSurvey,
  waitMs,
} from './survey-participation.utils';

@Component({
  selector: 'app-survey-participation',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './survey-participation.html',
  styleUrl: './survey-participation.scss',
})
/** Handles vote submission and live result rendering for one survey. */
export class SurveyParticipation implements OnInit, OnDestroy {
  private readonly voteLockStoragePrefix = 'survey-voted:';
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
  hasAlreadyVoted = false;
  voteCountsByAnswerId: Record<string, number> = {};
  voteTotalsByQuestionId: Record<string, number> = {};
  private stopVoteRealtimeListener: (() => void) | null = null;

  surveyForm = this.fb.group({
    questions: this.fb.array<FormControl<string[]>>([]),
  });

  /**
   * Returns typed access to the dynamic question form array.
   * @returns Question control form array.
   */
  get questionsArray(): FormArray<FormControl<string[]>> {
    return this.surveyForm.get('questions') as FormArray<FormControl<string[]>>;
  }

  /**
   * Initializes page styles, validates route id and loads survey data.
   * @returns Promise resolved after initial loading sequence.
   */
  async ngOnInit(): Promise<void> {
    this.document.body.classList.add('survey-page');
    this.surveyId = this.route.snapshot.paramMap.get('id');

    const idError = ensureSurveyIdOrError(this.surveyId);
    if (idError) {
      this.loadError = idError;
      this.finishInitialLoading();
      return;
    }

    await this.loadSurveyLifecycle();
    this.finishInitialLoading();
  }

  /**
   * Cleans up page class and active realtime listener.
   * @returns void
   */
  ngOnDestroy(): void {
    this.document.body.classList.remove('survey-page');
    this.stopVoteRealtimeUpdates();
  }

  /**
   * Loads survey, validates state and starts live updates.
   * @returns Promise resolved after lifecycle loading finishes.
   */
  private async loadSurveyLifecycle(): Promise<void> {
    try {
      const survey = await this.fetchSurvey();
      if (!survey || !this.prepareLoadedSurvey(survey)) {
        return;
      }
      await this.loadVoteCounts();
      this.hasAlreadyVoted = this.hasVoteLock();
      this.startVoteRealtimeUpdates();
    } catch (error: unknown) {
      this.setLoadError(error);
    }
  }

  /**
   * Fetches a survey from backend by route id.
   * @returns Loaded survey or null when id is missing.
   */
  private async fetchSurvey(): Promise<Surveys | null> {
    if (!this.surveyId) {
      return null;
    }
    return this.surveyService.getSurveyById(this.surveyId);
  }

  /**
   * Stores loaded survey and rejects expired entries.
   * @param survey Loaded survey instance.
   * @returns True when survey can be used for participation.
   */
  private prepareLoadedSurvey(survey: Surveys): boolean {
    if (surveyIsExpired(survey.endDate)) {
      this.loadError = 'Diese Umfrage ist bereits abgelaufen und kann nicht mehr ausgefuellt werden.';
      return false;
    }

    this.survey = survey;
    buildQuestionSelectionForm(this.fb, this.questionsArray, survey);
    return true;
  }

  /**
   * Maps unknown load errors to a user-facing message.
   * @param error Thrown error value.
   * @returns void
   */
  private setLoadError(error: unknown): void {
    this.loadError = buildUnknownErrorMessage('Umfrage konnte nicht geladen werden: ', error);
  }

  /**
   * Finishes initial loading state and refreshes view.
   * @returns void
   */
  private finishInitialLoading(): void {
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  /**
   * Starts realtime subscription and replaces existing listener if needed.
   * @returns void
   */
  private startVoteRealtimeUpdates(): void {
    if (!this.surveyId) {
      return;
    }

    this.stopVoteRealtimeUpdates();
    this.stopVoteRealtimeListener = this.surveyService.subscribeToSurveyVoteChanges(this.surveyId, () => {
      void this.loadVoteCounts();
    });
  }

  /**
   * Stops the current realtime subscription.
   * @returns void
   */
  private stopVoteRealtimeUpdates(): void {
    if (!this.stopVoteRealtimeListener) {
      return;
    }

    this.stopVoteRealtimeListener();
    this.stopVoteRealtimeListener = null;
  }

  /**
   * Fetches current vote counts while keeping UI responsive.
   * @returns Promise resolved after count refresh.
   */
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

  /**
   * Returns whether an answer is selected for a question index.
   * @param questionIndex Index of the question.
   * @param answerText Stored answer id or text.
   * @returns True when selected.
   */
  isAnswerChecked(questionIndex: number, answerText: string): boolean {
    const selectedAnswers = this.questionsArray.at(questionIndex).value;
    return selectedAnswers.includes(answerText);
  }

  /**
   * Adds or removes an answer from the question selection.
   * @param questionIndex Index of the question.
   * @param answerText Stored answer id or text.
   * @param checked Checkbox checked state.
   * @returns void
   */
  toggleAnswer(questionIndex: number, answerText: string, checked: boolean): void {
    if (this.hasAlreadyVoted || this.submitSuccess || this.isSubmitting) {
      return;
    }

    const control = this.questionsArray.at(questionIndex);
    const current = control.value;

    if (checked && !current.includes(answerText)) {
      control.setValue([...current, answerText]);
      return;
    }

    control.setValue(current.filter((answer) => answer !== answerText));
  }

  /**
   * Converts answer index to alphabetical label.
   * @param answerIndex Zero-based answer index.
   * @returns Alphabetical label.
   */
  answerLabel(answerIndex: number): string {
    return buildAnswerLabel(answerIndex);
  }

  /**
   * Validates and submits survey vote, then redirects to home.
   * @returns Promise resolved when submit flow ends.
   */
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

  /**
   * Checks submit preconditions and sets validation errors.
   * @returns True when submission can proceed.
   */
  private canSubmit(): boolean {
    if (this.submitSuccess || this.isSubmitting) return false;

    if (this.hasAlreadyVoted) {
      this.submitError = 'Du hast fuer diese Umfrage bereits abgestimmt.';
      return false;
    }

    if (this.surveyForm.invalid) {
      this.surveyForm.markAllAsTouched();
      return false;
    }

    if (this.surveyId && this.survey) return true;
    this.submitError = 'Umfrage konnte nicht zugeordnet werden.';
    return false;
  }

  /**
   * Prepares submit state before API interaction.
   * @returns void
   */
  private beginSubmit(): void {
    this.submitError = '';
    this.submitSuccess = false;
    this.isSubmitting = true;
  }

  /**
   * Persists selected answers to backend.
   * @returns Promise resolved after vote and refresh are saved.
   */
  private async persistVote(): Promise<void> {
    const payload = this.buildSubmissionPayload();
    await this.surveyService.submitSurveyVote(this.surveyId!, payload);
    this.storeVoteLock();
    this.hasAlreadyVoted = true;
    await this.loadVoteCounts();
  }

  /**
   * Sets success state and performs delayed home redirect.
   * @returns Promise resolved after navigation.
   */
  private async handleSuccessRedirect(): Promise<void> {
    this.submitSuccess = true;
    this.cdr.detectChanges();
    await waitMs(3000);
    await this.router.navigate(['/']);
  }

  /**
   * Maps unknown submit errors to user-facing text.
   * @param error Thrown error value.
   * @returns void
   */
  private setSubmitError(error: unknown): void {
    this.submitError = buildUnknownErrorMessage('Abstimmung konnte nicht gespeichert werden: ', error);
  }

  /**
   * Finalizes submit cycle and refreshes view.
   * @returns void
   */
  private finishSubmit(): void {
    this.isSubmitting = false;
    this.cdr.detectChanges();
  }

  /**
   * Builds API submission payload from selected answers.
   * @returns Array of question submissions.
   */
  private buildSubmissionPayload(): SurveySubmission[] {
    if (!this.survey) return [];
    return buildSurveySubmissionPayload(this.survey, this.questionsArray);
  }

  /**
   * Returns true when a question field has a visible validation error.
   * @param index Question index.
   * @returns True when invalid and touched.
   */
  questionHasError(index: number): boolean {
    const control = this.questionsArray.at(index);
    return control.invalid && control.touched;
  }

  /**
   * Formats date strings in de-DE locale.
   * @param dateValue Input date string.
   * @returns Localized label or fallback value.
   */
  formatDate(dateValue: string): string {
    return formatDateDe(dateValue);
  }

  /**
   * Returns vote percentage for one answer within a question.
   * @param questionId Question identifier.
   * @param answerId Answer identifier.
   * @returns Rounded percentage value.
   */
  resultPercent(questionId: string | undefined, answerId: string | undefined): number {
    if (!questionId || !answerId) {
      return 0;
    }

    let answerVotes = this.voteCountsByAnswerId[answerId] ?? 0;
    let questionVotes = this.voteTotalsByQuestionId[questionId] ?? 0;

    if (!this.hasAlreadyVoted && !this.submitSuccess) {
      const draftSelection = getDraftSelectionForQuestion(this.survey, questionId, this.questionsArray);
      if (draftSelection.length > 0) {
        questionVotes += draftSelection.length;
        if (draftSelection.includes(answerId)) {
          answerVotes += 1;
        }
      }
    }

    return calcResultPercent(questionId, answerId, {
      byAnswerId: { [answerId]: answerVotes },
      byQuestionId: { [questionId]: questionVotes },
    });
  }

  /**
   * Returns absolute vote count for an answer id.
   * @param answerId Answer identifier.
   * @returns Vote count for that answer.
   */
  resultVotes(answerId: string | undefined): number {
    return this.voteCountsByAnswerId[answerId ?? ''] ?? 0;
  }

  /**
   * Checks whether a local vote lock already exists for this survey.
   * @returns True when user already voted from this browser.
   */
  private hasVoteLock(): boolean {
    return hasVoteLockForSurvey(this.document, voteLockKeyForSurvey(this.voteLockStoragePrefix, this.surveyId));
  }

  /**
   * Persists a local vote lock after successful submission.
   * @returns void
   */
  private storeVoteLock(): void {
    storeVoteLockForSurvey(this.document, voteLockKeyForSurvey(this.voteLockStoragePrefix, this.surveyId));
  }
}
