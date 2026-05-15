import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SurveysSection } from "../surveys-section/surveys-section";

@Component({
  selector: 'app-hero-secton',
  imports: [SurveysSection, RouterLink],
  templateUrl: './hero-secton.html',
  styleUrl: './hero-secton.scss',
})
export class HeroSecton {}
