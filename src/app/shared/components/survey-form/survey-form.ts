import { Component, inject, input, output } from '@angular/core';
import { FormBuilder, FormArray, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Surveys } from '../surveys';
import { SurveyService } from '../../services/survey.service';

/** Represents the raw form shape for one survey question. */
interface FormQuestionRaw {
  questionText: string;
  allowMultipleAnswers: boolean;
  answers: string[];
}

/** Represents the raw form shape for the complete survey form. */
interface FormSurveyRaw {
  askName: string;
  description: string;
  category: string;
  endDate: string;
  ask: FormQuestionRaw[];
}

@Component({
  selector: 'app-survey-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './survey-form.html',
  styleUrl: './survey-form.scss',
})
/** Handles survey creation, validation and persistence from the form UI. */
export class SurveyForm {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private surveyService = inject(SurveyService);

  isDialogMode = input(false);
  closed = output<void>();
  saved = output<void>();

  categories = ['Team Activities', 'Health & Wellness', 'Gaming & Entertainment', 'Education & Learning', 'Lifestyle & Preferences', 'Technology & Innovation'];
  minEndDate = this.currentDate();
  isSaving = false;
  submitError = '';

  surveyForm = this.fb.group({
    askName: ['', Validators.required],
    description: [''],
    category: [''],
    endDate: [''],
    ask: this.fb.array([this.createQuestion()])
  });

  /** Returns typed access to the question form array. */
  get askArray(): FormArray {
    return this.surveyForm.get('ask') as FormArray;
  }

  /** Returns the answers array for a question index. */
  answersArray(questionIndex: number): FormArray {
    return this.askArray.at(questionIndex).get('answers') as FormArray;
  }

  /** Creates the default form group for one survey question. */
  createQuestion() {
    return this.fb.group({
      questionText: ['', Validators.required],
      allowMultipleAnswers: [false],
      answers: this.fb.array([
        this.fb.control('', Validators.required),
        this.fb.control('', Validators.required)
      ])
    });
  }

  /** Appends a new question block to the form. */
  addQuestion(): void {
    this.askArray.push(this.createQuestion());
  }

  /** Removes a question when at least one other question remains. */
  removeQuestion(index: number): void {
    if (this.askArray.length > 1) {
      this.askArray.removeAt(index);
    }
  }

  /** Adds a new answer control to the selected question. */
  addAnswer(questionIndex: number): void {
    this.answersArray(questionIndex).push(this.fb.control('', Validators.required));
  }

  /** Removes one answer control when the question still keeps one answer. */
  removeAnswer(questionIndex: number, answerIndex: number): void {
    const answers = this.answersArray(questionIndex);
    if (answers.length > 1) {
      answers.removeAt(answerIndex);
    }
  }

  /** Returns typed access to a single answer control. */
  getAnswerControl(questionIndex: number, answerIndex: number): FormControl {
    return this.answersArray(questionIndex).at(answerIndex) as FormControl;
  }

  /** Maps an answer index to an alphabetical label. */
  answerLabel(answerIndex: number): string {
    return String.fromCharCode(65 + answerIndex);
  }

  /** Checks whether a top-level control contains non-whitespace input. */
  hasControlValue(controlName: keyof Omit<FormSurveyRaw, 'ask'>): boolean {
    const value = this.surveyForm.get(controlName)?.value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  /** Clears the selected top-level control. */
  clearControl(controlName: keyof Omit<FormSurveyRaw, 'ask'>): void {
    this.surveyForm.get(controlName)?.setValue('');
  }

  /** Checks whether a question title currently contains text. */
  hasQuestionText(questionIndex: number): boolean {
    const value = this.askArray.at(questionIndex).get('questionText')?.value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  /** Clears the text of one question. */
  clearQuestionText(questionIndex: number): void {
    this.askArray.at(questionIndex).get('questionText')?.setValue('');
  }

  /** Checks whether one answer control currently contains text. */
  hasAnswerValue(questionIndex: number, answerIndex: number): boolean {
    const value = this.getAnswerControl(questionIndex, answerIndex).value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  /** Clears the value of one answer control. */
  clearAnswerValue(questionIndex: number, answerIndex: number): void {
    this.getAnswerControl(questionIndex, answerIndex).setValue('');
  }

  /** Returns the current date in input-compatible ISO format. */
  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Validates the form and persists a new survey when possible. */
  async onSubmit(): Promise<void> {
    this.submitError = '';

    if (this.surveyForm.invalid || this.isSaving) {
      this.surveyForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const formValue = this.surveyForm.getRawValue() as FormSurveyRaw;
      const startDate = this.currentDate();
      const endDate = formValue.endDate && formValue.endDate >= startDate ? formValue.endDate : startDate;
      const survey: Surveys = {
        askName: formValue.askName.trim(),
        startDate,
        endDate,
        category: formValue.category,
        ask: formValue.ask.map((question) => ({
          questionText: question.questionText.trim(),
          answers: question.answers
            .map((answer) => answer.trim())
            .filter((answer) => answer.length > 0)
            .map((answer) => ({ text: answer })),
        })),
      };

      await this.surveyService.createSurvey(survey);

      if (this.isDialogMode()) {
        this.saved.emit();
        return;
      }

      void this.router.navigate(['/']);
    } catch {
      this.submitError = 'Speichern fehlgeschlagen. Bitte wende dich an den Admin.';
    } finally {
      this.isSaving = false;
    }
  }

  /** Closes the dialog or navigates back to the home view. */
  navigateBack(): void {
    if (this.isDialogMode()) {
      this.closed.emit();
      return;
    }

    void this.router.navigate(['/']);
  }
}
