import { Component } from '@angular/core';
import { SurveysCard } from '../surveys-card/surveys-card';
import { AllSurveysSection } from '../all-surveys-section/all-surveys-section';

@Component({
  selector: 'app-surveys-section',
  imports: [SurveysCard, AllSurveysSection],
  templateUrl: './surveys-section.html',
  styleUrl: './surveys-section.scss',
})
export class SurveysSection {
 
}
