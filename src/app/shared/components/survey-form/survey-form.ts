import { Component, inject } from '@angular/core';
import { FormBuilder, FormArray, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Surveys } from '../surveys';
import { SurveyService } from '../../services/survey.service';

interface FormQuestionRaw {
  questionText: string;
  allowMultipleAnswers: boolean;
  answers: string[];
}

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
export class SurveyForm {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private surveyService = inject(SurveyService);

  categories = ['Team Activities', 'Health & Wellness', 'Gaming & Entertainment', 'Education & Learning', 'Lifestyle & Preferences', 'Technology & Innovation'];

  isSaving = false;
  submitError = '';

  surveyForm = this.fb.group({
    askName: ['', Validators.required],
    description: [''],
    category: [''],
    endDate: [''],
    ask: this.fb.array([this.createQuestion()])
  });

  get askArray(): FormArray {
    return this.surveyForm.get('ask') as FormArray;
  }

  answersArray(questionIndex: number): FormArray {
    return this.askArray.at(questionIndex).get('answers') as FormArray;
  }

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

  addQuestion(): void {
    this.askArray.push(this.createQuestion());
  }

  removeQuestion(index: number): void {
    if (this.askArray.length > 1) {
      this.askArray.removeAt(index);
    }
  }

  addAnswer(questionIndex: number): void {
    this.answersArray(questionIndex).push(this.fb.control('', Validators.required));
  }

  removeAnswer(questionIndex: number, answerIndex: number): void {
    const answers = this.answersArray(questionIndex);
    if (answers.length > 1) {
      answers.removeAt(answerIndex);
    }
  }

  getAnswerControl(questionIndex: number, answerIndex: number): FormControl {
    return this.answersArray(questionIndex).at(answerIndex) as FormControl;
  }

  answerLabel(answerIndex: number): string {
    return String.fromCharCode(65 + answerIndex);
  }

  hasControlValue(controlName: keyof Omit<FormSurveyRaw, 'ask'>): boolean {
    const value = this.surveyForm.get(controlName)?.value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  clearControl(controlName: keyof Omit<FormSurveyRaw, 'ask'>): void {
    this.surveyForm.get(controlName)?.setValue('');
  }

  hasQuestionText(questionIndex: number): boolean {
    const value = this.askArray.at(questionIndex).get('questionText')?.value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  clearQuestionText(questionIndex: number): void {
    this.askArray.at(questionIndex).get('questionText')?.setValue('');
  }

  hasAnswerValue(questionIndex: number, answerIndex: number): boolean {
    const value = this.getAnswerControl(questionIndex, answerIndex).value;
    return typeof value === 'string' && value.trim().length > 0;
  }

  clearAnswerValue(questionIndex: number, answerIndex: number): void {
    this.getAnswerControl(questionIndex, answerIndex).setValue('');
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

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
      const endDate = formValue.endDate || startDate;
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
      this.router.navigate(['/']);
    } catch {
      this.submitError = 'Speichern fehlgeschlagen. Bitte wende dich an den Admin.';
    } finally {
      this.isSaving = false;
    }
  }

  navigateBack(): void {
    this.router.navigate(['/']);
  }
}
