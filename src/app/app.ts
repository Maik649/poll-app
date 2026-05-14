import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './shared/components/header/header';
import { HeroSecton } from './shared/components/hero-secton/hero-secton';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, HeroSecton],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('poll-app');
}
