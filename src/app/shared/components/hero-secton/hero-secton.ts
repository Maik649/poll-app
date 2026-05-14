import { Component } from '@angular/core';
import { SurveysSection } from "../surveys-section/surveys-section";

@Component({
  selector: 'app-hero-secton',
  imports: [SurveysSection],
  templateUrl: './hero-secton.html',
  styleUrl: './hero-secton.scss',
})
export class HeroSecton {}
