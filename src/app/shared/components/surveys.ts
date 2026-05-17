/** Represents a selectable answer option within a survey question. */
export interface Answer {
    id?: string;
    text: string;
}

/** Represents a survey question with its available answers. */
export interface Ask {
    id?: string;
    questionText: string;
    answers: Answer[];
}

/** Represents a complete survey with metadata and questions. */
export interface Surveys {
    id?: string;
    askName: string;
    startDate: string;
    endDate: string;
    category: string;
    ask: Ask[];
}

