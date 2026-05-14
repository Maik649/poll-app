import { Component } from '@angular/core';
import { SurveysCard } from '../surveys-card/surveys-card';

@Component({
  selector: 'app-surveys-section',
  imports: [SurveysCard],
  templateUrl: './surveys-section.html',
  styleUrl: './surveys-section.scss',
})
export class SurveysSection {}
