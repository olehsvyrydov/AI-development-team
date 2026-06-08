import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GLYPH_NAMES, GlyphComponent } from './glyph.component';

function mount(name: string): ComponentFixture<GlyphComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [GlyphComponent] });
  const fixture = TestBed.createComponent(GlyphComponent);
  fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  return fixture;
}

describe('GlyphComponent', () => {
  it('renders an inline SVG for every supported glyph name (no tofu, no icon font)', () => {
    for (const name of GLYPH_NAMES) {
      const host = mount(name).nativeElement as HTMLElement;
      const svg = host.querySelector('svg');
      expect(svg, `glyph ${name} should render an svg`).toBeTruthy();
      expect(svg!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders nothing for an unknown glyph name', () => {
    const host = mount('does-not-exist').nativeElement as HTMLElement;
    expect(host.querySelector('svg')).toBeNull();
  });
});
