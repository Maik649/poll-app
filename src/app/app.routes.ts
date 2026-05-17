import { Routes } from '@angular/router';
import { HeroSecton } from './shared/components/hero-secton/hero-secton';
import { SurveyParticipation } from './shared/components/survey-participation/survey-participation';

/** Defines the top-level routes for the poll application. */
export const routes: Routes = [
    {
        path: '',
        component: HeroSecton,
    },
    {
        path: 'umfrage-erstellen',
        component: HeroSecton,
    },
    {
        path: 'umfrage/:id',
        component: SurveyParticipation,
    },
];
