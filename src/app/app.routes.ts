import { Routes } from '@angular/router';
import { HeroSecton } from './shared/components/hero-secton/hero-secton';
import { SurveyForm } from './shared/components/survey-form/survey-form';
import { SurveyParticipation } from './shared/components/survey-participation/survey-participation';

export const routes: Routes = [
    {
        path: '',
        component: HeroSecton,
    },
    {
        path: 'umfrage-erstellen',
        component: SurveyForm,
    },
    {
        path: 'umfrage/:id',
        component: SurveyParticipation,
    },
];
