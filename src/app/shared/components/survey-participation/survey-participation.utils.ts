import { FormArray, FormBuilder, FormControl, Validators } from '@angular/forms';
import { SurveySubmission, SurveyVoteCounts } from '../../services/survey.service';
import { Surveys } from '../surveys';

/**
 * Normalizes a date to midnight for day-based comparisons.
 * @param date Date instance to normalize.
 * @returns The normalized date instance.
 */
export function normalizeDateToMidnight(date: Date): Date {
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Formats a date string using de-DE locale.
 * @param dateValue Input date string.
 * @returns Localized label or fallback value.
 */
export function formatDateDe(dateValue: string): string {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat('de-DE').format(date);
}

/**
 * Returns a localized relative end-date label.
 * @param endDate Survey end date value.
 * @returns Relative status text.
 */
export function daysUntilEndLabel(endDate: string): string {
  const today = normalizeDateToMidnight(new Date());
  const end = normalizeDateToMidnight(new Date(endDate));
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Abgelaufen';
  if (diff === 0) return 'Endet heute';
  if (diff === 1) return 'Endet in 1 Tag';
  return `Endet in ${diff} Tagen`;
}

/**
 * Checks whether a survey end date is already in the past.
 * @param endDate Survey end date value.
 * @returns True when expired.
 */
export function surveyIsExpired(endDate: string): boolean {
  const today = normalizeDateToMidnight(new Date());
  const end = normalizeDateToMidnight(new Date(endDate));
  if (Number.isNaN(end.getTime())) return true;
  return end < today;
}

/**
 * Converts an answer index to an alphabetical label.
 * @param answerIndex Zero-based answer index.
 * @returns Alphabetical label.
 */
export function buildAnswerLabel(answerIndex: number): string {
  return String.fromCharCode(65 + answerIndex);
}

/**
 * Returns vote percentage for one answer within a question.
 * @param questionId Question identifier.
 * @param answerId Answer identifier.
 * @param counts Vote counts grouped by answer and question id.
 * @returns Rounded percentage value.
 */
export function calcResultPercent(
  questionId: string | undefined,
  answerId: string | undefined,
  counts: SurveyVoteCounts
): number {
  if (!questionId || !answerId) return 0;
  const questionTotal = counts.byQuestionId[questionId] ?? 0;
  if (questionTotal === 0) return 0;
  return Math.round(((counts.byAnswerId[answerId] ?? 0) / questionTotal) * 100);
}

/**
 * Returns a promise that resolves after the given delay.
 * @param ms Delay in milliseconds.
 * @returns Promise resolved after timeout.
 */
export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the API submission payload from selected form answers.
 * @param survey Current survey model.
 * @param questionsArray Form array holding selected answer ids per question.
 * @returns Array of question submissions ready for the API.
 */
export function buildSurveySubmissionPayload(
  survey: Surveys,
  questionsArray: FormArray<FormControl<string[]>>
): SurveySubmission[] {
  return survey.ask
    .map((question, questionIndex) => ({
      questionId: question.id ?? '',
      answerIds: questionsArray.at(questionIndex).value,
    }))
    .filter((submission) => submission.questionId.length > 0 && submission.answerIds.length > 0);
}

/**
 * Returns an error string when survey id is missing.
 * @param surveyId Survey identifier from route.
 * @returns Null when id exists, otherwise error text.
 */
export function ensureSurveyIdOrError(surveyId: string | null): string | null {
  return surveyId ? null : 'Keine Umfrage-ID gefunden.';
}

/**
 * Maps unknown errors to a prefixed user-facing message.
 * @param prefix Text prefix shown before the error details.
 * @param error Unknown thrown value.
 * @returns Final user-facing message.
 */
export function buildUnknownErrorMessage(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
  return `${prefix}${message}`;
}

/**
 * Rebuilds the dynamic answer-selection controls for all questions.
 * @param formBuilder Angular form builder instance.
 * @param questionsArray Target questions array to rewrite.
 * @param survey Current survey model.
 * @returns void
 */
export function buildQuestionSelectionForm(
  formBuilder: FormBuilder,
  questionsArray: FormArray<FormControl<string[]>>,
  survey: Surveys
): void {
  questionsArray.clear();
  for (const _question of survey.ask) {
    questionsArray.push(formBuilder.control<string[]>([], { nonNullable: true, validators: [Validators.required] }));
  }
}

/**
 * Returns selected draft answers for one question id.
 * @param survey Current survey model.
 * @param questionId Question identifier.
 * @param questionsArray Form array with current selections.
 * @returns Selected answer ids for this question.
 */
export function getDraftSelectionForQuestion(
  survey: Surveys | null,
  questionId: string,
  questionsArray: FormArray<FormControl<string[]>>
): string[] {
  if (!survey) {
    return [];
  }

  const questionIndex = survey.ask.findIndex((question) => question.id === questionId);
  if (questionIndex < 0) {
    return [];
  }

  return questionsArray.at(questionIndex).value;
}

/**
 * Returns storage key used to lock voting per survey.
 * @param keyPrefix Vote-lock key prefix.
 * @param surveyId Current survey id.
 * @returns Local storage key for this survey.
 */
export function voteLockKeyForSurvey(keyPrefix: string, surveyId: string | null): string | null {
  if (!surveyId) {
    return null;
  }
  return `${keyPrefix}${surveyId}`;
}

/**
 * Checks whether a local vote lock already exists for this survey.
 * @param document Browser document used to access local storage.
 * @param key Local storage key for vote lock.
 * @returns True when user already voted from this browser.
 */
export function hasVoteLockForSurvey(document: Document, key: string | null): boolean {
  const storage = document.defaultView?.localStorage;
  if (!key || !storage) {
    return false;
  }

  try {
    return storage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Persists a local vote lock after successful submission.
 * @param document Browser document used to access local storage.
 * @param key Local storage key for vote lock.
 * @returns void
 */
export function storeVoteLockForSurvey(document: Document, key: string | null): void {
  const storage = document.defaultView?.localStorage;
  if (!key || !storage) {
    return;
  }

  try {
    storage.setItem(key, '1');
  } catch {
  }
}
