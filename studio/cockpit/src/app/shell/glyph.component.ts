import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The set of inline-SVG glyph names this component can render. Every interactive surface draws its
 * icons from here so there is one monoline 24×24 source of truth — no icon font, no exotic Unicode
 * (which would fall back to tofu when a font lacks it). Each glyph is decorative (`aria-hidden`)
 * and pairs with adjacent text, so status is never carried by glyph or colour alone.
 */
export const GLYPH_NAMES = [
  'progress',
  'dot',
  'blocked',
  'check',
  'cross',
  'pending',
  'kebab',
  'advance',
  'approve',
  'reject',
  'add-comment',
  'conflict',
  'need',
  'agent',
  'spinner',
  'edit',
  'grip',
  'save',
  'preset',
  'info',
  'warning',
  'remove',
  'add-stage',
  'trash',
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

/**
 * A single monoline inline-SVG icon selected by {@link name}. Stroke colour is inherited
 * (`currentColor`) so the consuming context colours it; the SVG itself is `aria-hidden` because the
 * accessible meaning always lives in the neighbouring text label.
 */
@Component({
  selector: 'dart-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('progress') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <rect x="4" y="4" width="8" height="16" fill="currentColor" stroke="none" />
        </svg>
      }
      @case ('dot') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        </svg>
      }
      @case ('blocked') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('check') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <polyline points="5,12 10,17 19,7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
      @case ('cross') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      }
      @case ('pending') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3" />
        </svg>
      }
      @case ('kebab') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      }
      @case ('advance') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <line x1="4" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <polyline points="12,7 17,12 12,17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="20" y1="6" x2="20" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('approve') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <polyline points="8,12 11,15 16,9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
      @case ('reject') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('add-comment') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M4 5 h16 v11 H9 l-4 4 v-4 H4 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="9.5" y1="10.5" x2="14.5" y2="10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('conflict') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M12 20 V13 M12 13 l-5 -5 M12 13 l5 -5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="7" y1="8" x2="3.5" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="17" y1="8" x2="20.5" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('need') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M6 3 h12 M6 21 h12 M7 3 c0 5 4 6 5 9 c1 -3 5 -4 5 -9 M7 21 c0 -5 4 -6 5 -9 c1 3 5 4 5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
      @case ('agent') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M12 3 L21 12 L12 21 L3 12 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
        </svg>
      }
      @case ('spinner') {
        <svg class="glyph-spin" aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="38 14" />
        </svg>
      }
      @case ('edit') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <line x1="14" y1="7" x2="17" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('grip') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      }
      @case ('save') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M5 4 h11 l3 3 v13 H5 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <rect x="8" y="4" width="6" height="5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <rect x="8" y="13" width="8" height="5" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      }
      @case ('preset') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="9" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="15" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      }
      @case ('info') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
          <line x1="12" y1="11" x2="12" y2="16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('warning') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M12 4 L21 19 H3 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <line x1="12" y1="10" x2="12" y2="14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      }
      @case ('remove') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <line x1="7" y1="7" x2="17" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <line x1="17" y1="7" x2="7" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      }
      @case ('add-stage') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="19" y1="9" x2="19" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="16" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
      @case ('trash') {
        <svg aria-hidden="true" viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
          <path d="M6 7 h12 v13 H6 z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M9 7 V4 h6 v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <line x1="10" y1="11" x2="10" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="14" y1="11" x2="14" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      }
    }
  `,
  styles: `
    :host { display: inline-flex; line-height: 0; }
    .glyph-spin { animation: glyph-rot 0.9s linear infinite; }
    @media (prefers-reduced-motion: reduce) { .glyph-spin { animation: none; } }
    @keyframes glyph-rot { to { transform: rotate(360deg); } }
  `,
})
export class GlyphComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(16);
}
