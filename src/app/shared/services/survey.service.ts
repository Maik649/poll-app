import { Injectable } from '@angular/core';
import { RealtimeChannel, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Surveys } from '../components/surveys';

/** Represents one answer row returned from the database. */
interface DbSurveyAnswer {
  id: string;
  question_id: string;
  answer_text: string;
  position: number;
}

/** Represents one question row returned from the database. */
interface DbSurveyQuestion {
  id: string;
  survey_id: string;
  question_text: string;
  position: number;
}

/** Represents one survey row returned from the database. */
interface DbSurvey {
  id: string;
  ask_name: string;
  start_date: string;
  end_date: string;
  category: string;
}

/** Represents one persisted survey vote row. */
interface SurveyVoteRow {
  survey_id: string;
  question_id: string;
  answer_id: string;
}

/** Represents the selected answers for a single survey question. */
export interface SurveySubmission {
  questionId: string;
  answerIds: string[];
}

/** Groups vote counts by answer and by question. */
export interface SurveyVoteCounts {
  byAnswerId: Record<string, number>;
  byQuestionId: Record<string, number>;
}

@Injectable({
  providedIn: 'root',
})
/** Encapsulates survey persistence and live vote aggregation through Supabase. */
export class SurveyService {
  private supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  constructor() {
    this.validateConfig();
  }

  /**
   * Validates the runtime Supabase configuration before any request is sent.
   * @returns void
   */
  private validateConfig(): void {
    const { supabaseUrl, supabaseAnonKey } = environment;

    const hasPlaceholderUrl =!supabaseUrl || supabaseUrl.includes('YOUR_PROJECT_ID') ||supabaseUrl.includes('your_project_id');

    const hasPlaceholderKey =
      !supabaseAnonKey ||
      supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY') ||
      supabaseAnonKey.includes('your_supabase_anon_key');

    if (hasPlaceholderUrl || hasPlaceholderKey) {
      throw new Error('Supabase ist nicht konfiguriert. Bitte trage in src/environments/environment.ts deine echte supabaseUrl und supabaseAnonKey ein.');
    }
  }

  /**
   * Wraps an async operation with a timeout to avoid hanging UI requests.
   * @param promise Promise-like operation to execute.
   * @param label Operation label used in timeout errors.
   * @param timeoutMs Timeout in milliseconds.
   * @returns Promise resolved with the operation result.
   */
  private async withTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} hat zu lange gedauert (Timeout nach ${timeoutMs / 1000}s).`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([Promise.resolve(promise), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Creates a survey including its questions and answer options.
   * @param survey Survey payload to persist.
   * @returns Promise resolved when all inserts succeed.
   */
  async createSurvey(survey: Surveys): Promise<void> {
    const { data: insertedSurvey, error: surveyError } = await this.supabase
      .from('surveys')
      .insert({
        ask_name: survey.askName,
        start_date: survey.startDate,
        end_date: survey.endDate,
        category: survey.category,
        created_by: null,
      })
      .select('id')
      .single();

    if (surveyError || !insertedSurvey) {
      throw surveyError ?? new Error('Your survey is now published');
    }

    const questionsPayload = survey.ask.map((question, position) => ({
      survey_id: insertedSurvey.id,
      question_text: question.questionText,
      position,
    }));

    const { data: insertedQuestions, error: questionsError } = await this.supabase
      .from('survey_questions').insert(questionsPayload).select('id, position');

    if (questionsError || !insertedQuestions) {
      throw questionsError ?? new Error('Fragen konnten nicht gespeichert werden.');
    }

    const answersPayload = insertedQuestions.flatMap((insertedQuestion) => {
      const sourceQuestion = survey.ask[insertedQuestion.position];
      return sourceQuestion.answers.map((answer, answerPosition) => ({
        question_id: insertedQuestion.id,
        answer_text: answer.text,
        position: answerPosition,
      }));
    });

    const { error: answersError } = await this.supabase
      .from('survey_answers').insert(answersPayload);

    if (answersError) {
      throw answersError;
    }
  }

  /**
   * Loads all surveys with nested questions and answer options.
   * @returns Surveys with expanded questions and answers.
   */
  async getSurveys(): Promise<Surveys[]> {
    const { data: surveysData, error: surveysError } = await this.withTimeout(
      this.supabase
        .from('surveys')
        .select('id,ask_name,start_date,end_date,category')
        .order('id', { ascending: false }),
      'Laden der Umfragen');

    if (surveysError) {
      throw surveysError;
    }

    const surveys = (surveysData ?? []) as DbSurvey[];
    if (surveys.length === 0) {
      return [];
    }

    const surveyIds = surveys.map((survey) => survey.id);

    const { data: questionsData, error: questionsError } = await this.withTimeout(
      this.supabase
        .from('survey_questions')
        .select('id,survey_id,question_text,position')
        .in('survey_id', surveyIds)
        .order('position', { ascending: true }),
      'Laden der Fragen'
    );

    if (questionsError) {
      throw questionsError;
    }

    const questions = (questionsData ?? []) as DbSurveyQuestion[];
    const questionIds = questions.map((question) => question.id);

    let answers: Array<DbSurveyAnswer & { question_id: string }> = [];
    if (questionIds.length > 0) {
      const { data: answersData, error: answersError } = await this.withTimeout(
        this.supabase
          .from('survey_answers')
          .select('id,question_id,answer_text,position')
          .in('question_id', questionIds)
          .order('position', { ascending: true }),
        'Laden der Antworten'
      );

      if (answersError) {
        throw answersError;
      }
      answers = (answersData ?? []) as DbSurveyAnswer[];
    }

    const answersByQuestionId = new Map<string, DbSurveyAnswer[]>();
    for (const answer of answers) {
      const list = answersByQuestionId.get(answer.question_id) ?? [];
      list.push(answer);
      answersByQuestionId.set(answer.question_id, list);
    }

    const questionsBySurveyId = new Map<string, DbSurveyQuestion[]>();
    for (const question of questions) {
      const list = questionsBySurveyId.get(question.survey_id) ?? [];
      list.push(question);
      questionsBySurveyId.set(question.survey_id, list);
    }

    return surveys.map((survey) => {
      const sortedQuestions = [...(questionsBySurveyId.get(survey.id) ?? [])].sort((a, b) => a.position - b.position);

      return {
        id: survey.id,
        askName: survey.ask_name,
        startDate: survey.start_date,
        endDate: survey.end_date,
        category: survey.category,
        ask: sortedQuestions.map((question) => ({
          id: question.id,
          questionText: question.question_text,
          answers: [...(answersByQuestionId.get(question.id) ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((answer) => ({ id: answer.id, text: answer.answer_text })),
        })),
      };
    });
  }
    /**
     * Loads one survey by id including its nested questions and answers.
     * @param surveyId Survey identifier.
     * @returns Survey with nested questions and answers, or null when missing.
     */

  async getSurveyById(surveyId: string): Promise<Surveys | null> {
    const { data: surveyData, error: surveyError } = await this.withTimeout(
      this.supabase
        .from('surveys')
        .select('id,ask_name,start_date,end_date,category')
        .eq('id', surveyId)
        .maybeSingle(),
      'Laden der Umfrage');

    if (surveyError) {
      throw surveyError;
    }

    if (!surveyData) {
      return null;
    }
    const survey = surveyData as DbSurvey;

    const { data: questionsData, error: questionsError } = await this.withTimeout(
      this.supabase
        .from('survey_questions')
        .select('id,survey_id,question_text,position')
        .eq('survey_id', surveyId)
        .order('position', { ascending: true }),
      'Laden der Fragen'
    );

    if (questionsError) {
      throw questionsError;
    }

    const questions = (questionsData ?? []) as DbSurveyQuestion[];
    const questionIds = questions.map((question) => question.id);

    let answers: DbSurveyAnswer[] = [];
    if (questionIds.length > 0) {
      const { data: answersData, error: answersError } = await this.withTimeout(
        this.supabase
          .from('survey_answers')
          .select('id,question_id,answer_text,position')
          .in('question_id', questionIds)
          .order('position', { ascending: true }),
        'Laden der Antworten' );

      if (answersError) {
        throw answersError;
      }
      answers = (answersData ?? []) as DbSurveyAnswer[];
    }

    const answersByQuestionId = new Map<string, DbSurveyAnswer[]>();
    for (const answer of answers) {
      const list = answersByQuestionId.get(answer.question_id) ?? [];
      list.push(answer);
      answersByQuestionId.set(answer.question_id, list);
    }

    return {
      id: survey.id,
      askName: survey.ask_name,
      startDate: survey.start_date,
      endDate: survey.end_date,
      category: survey.category,
      ask: questions.map((question) => ({
        id: question.id,
        questionText: question.question_text,
        answers: [...(answersByQuestionId.get(question.id) ?? [])]
          .sort((a, b) => a.position - b.position).map((answer) => ({ id: answer.id, text: answer.answer_text })),
      })),
    };
  }

  /**
   * Stores the selected answers for one survey submission.
   * @param surveyId Survey identifier.
   * @param submission Selected answers grouped by question.
   * @returns Promise resolved when vote rows are written.
   */
  async submitSurveyVote(surveyId: string, submission: SurveySubmission[]): Promise<void> {
    const rows: SurveyVoteRow[] = submission.flatMap((questionSubmission) =>
      questionSubmission.answerIds.map((answerId) => ({
        survey_id: surveyId,
        question_id: questionSubmission.questionId,
        answer_id: answerId,
      }))
    );

    if (rows.length === 0) {
      return;
    }

    const { error } = await this.withTimeout(
      this.supabase.from('survey_answer_votes').insert(rows),'Speichern der Abstimmung');

    if (error) {
      throw error;
    }
  }

  /**
   * Aggregates persisted votes for the live result display of one survey.
   * @param surveyId Survey identifier.
   * @returns Vote counts grouped by answer and question id.
   */
  async getSurveyVoteCounts(surveyId: string): Promise<SurveyVoteCounts> {
    const { data, error } = await this.withTimeout(
      this.supabase
        .from('survey_answer_votes')
        .select('question_id,answer_id')
        .eq('survey_id', surveyId),
      'Laden der Live-Ergebnisse'
    );
    if (error) {
      throw error;
    }

    const rows = (data ?? []) as Array<Pick<SurveyVoteRow, 'question_id' | 'answer_id'>>;
    const byAnswerId: Record<string, number> = {};
    const byQuestionId: Record<string, number> = {};

    for (const row of rows) {
      byAnswerId[row.answer_id] = (byAnswerId[row.answer_id] ?? 0) + 1;
      byQuestionId[row.question_id] = (byQuestionId[row.question_id] ?? 0) + 1;
    }
    return { byAnswerId, byQuestionId };
  }

  /**
   * Subscribes to vote changes for one survey and returns a cleanup function.
   * @param surveyId Survey identifier.
   * @param onChange Callback executed after vote table changes.
   * @returns Cleanup callback to remove the channel subscription.
   */
  subscribeToSurveyVoteChanges(surveyId: string, onChange: () => void): () => void {
    const channelName = `survey-votes-${surveyId}-${Math.random().toString(36).slice(2)}`;
    const channel: RealtimeChannel = this.supabase
      .channel(channelName).on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'survey_answer_votes',
          filter: `survey_id=eq.${surveyId}`,
        },
        () => onChange()).subscribe();
    return () => {
      void this.supabase.removeChannel(channel);
    };
  }
}
