export interface Answer {
    id?: string;
    text: string;
}

export interface Ask {
    id?: string;
    questionText: string;
    answers: Answer[];
}

export interface Surveys {
    id?: string;
    askName: string;
    startDate: string;
    endDate: string;
    category: string;
    ask: Ask[];
}

