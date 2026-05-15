import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurveyService, SurveySubmission } from '../../services/survey.service';
import { Surveys } from '../surveys';

@Component({
  selector: 'app-survey-participation',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './survey-participation.html',
  styleUrl: './survey-participation.scss',
})
export class SurveyParticipation implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
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

  get questionsArray(): FormArray<FormControl<string[]>> {
    return this.surveyForm.get('questions') as FormArray<FormControl<string[]>>;
  }

  async ngOnInit(): Promise<void> {
    this.document.body.classList.add('survey-page');
    this.surveyId = this.route.snapshot.paramMap.get('id');

    if (!this.surveyId) {
      this.loadError = 'Keine Umfrage-ID gefunden.';
      this.isLoading = false;
      return;
    }

    try {
      const survey = await this.surveyService.getSurveyById(this.surveyId);

      if (!survey) {
        this.loadError = 'Die Umfrage wurde nicht gefunden.';
        return;
      }

      this.survey = survey;
      this.buildForm(survey);
      await this.loadVoteCounts();
      this.startLivePolling();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.loadError = `Umfrage konnte nicht geladen werden: ${message}`;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('survey-page');

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  private startLivePolling(): void {
    if (!this.surveyId) {
      return;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(() => {
      void this.loadVoteCounts();
    }, 5000);
  }

  private async loadVoteCounts(): Promise<void> {
    if (!this.surveyId) {
      return;
    }

    try {
      const counts = await this.surveyService.getSurveyVoteCounts(this.surveyId);
      this.voteCountsByAnswerId = counts.byAnswerId;
      this.voteTotalsByQuestionId = counts.byQuestionId;
    } catch {
      // Live panel should still render even when vote count loading fails.
    } finally {
      this.cdr.detectChanges();
    }
  }

  private buildForm(survey: Surveys): void {
    this.questionsArray.clear();

    for (const _question of survey.ask) {
      this.questionsArray.push(this.fb.control<string[]>([], { nonNullable: true, validators: [Validators.required] }));
    }
  }

  isAnswerChecked(questionIndex: number, answerText: string): boolean {
    const selectedAnswers = this.questionsArray.at(questionIndex).value;
    return selectedAnswers.includes(answerText);
  }

  toggleAnswer(questionIndex: number, answerText: string, checked: boolean): void {
    const control = this.questionsArray.at(questionIndex);
    const current = control.value;

    if (checked) {
      if (!current.includes(answerText)) {
        control.setValue([...current, answerText]);
      }
      return;
    }

    control.setValue(current.filter((answer) => answer !== answerText));
  }

  answerLabel(answerIndex: number): string {
    return String.fromCharCode(65 + answerIndex);
  }

  async submitSurvey(): Promise<void> {
    if (this.submitSuccess || this.isSubmitting) {
      return;
    }

    if (this.surveyForm.invalid) {
      this.surveyForm.markAllAsTouched();
      return;
    }

    if (!this.surveyId || !this.survey) {
      this.submitError = 'Umfrage konnte nicht zugeordnet werden.';
      return;
    }

    this.submitError = '';
    this.submitSuccess = false;
    this.isSubmitting = true;

    try {
      const submission = this.buildSubmissionPayload();
      await this.surveyService.submitSurveyVote(this.surveyId, submission);
      this.submitSuccess = true;
      await this.loadVoteCounts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      this.submitError = `Abstimmung konnte nicht gespeichert werden: ${message}`;
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  private buildSubmissionPayload(): SurveySubmission[] {
    if (!this.survey) {
      return [];
    }

    return this.survey.ask
      .map((question, questionIndex) => ({
        questionId: question.id ?? '',
        answerIds: this.questionsArray.at(questionIndex).value,
      }))
      .filter((questionSubmission) => questionSubmission.questionId.length > 0 && questionSubmission.answerIds.length > 0);
  }

  questionHasError(index: number): boolean {
    const control = this.questionsArray.at(index);
    return control.invalid && control.touched;
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

  resultVotes(answerId: string | undefined): number {
    if (!answerId) {
      return 0;
    }

    return this.voteCountsByAnswerId[answerId] ?? 0;
  }
}
