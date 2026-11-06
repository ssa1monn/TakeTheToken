import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { professorInitials, ratingStars } from '../identity.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('every catalog stock has a two-letter English monogram', () => {
  for (const professor of catalog.professors) assert.match(professorInitials(professor.name), /^[A-Z]{2}$/);
  assert.equal(professorInitials('김인수'), 'IS');
  assert.equal(professorInitials('김지범'), 'JB');
  assert.equal(professorInitials('이장호'), 'JH');
});

test('temperature stars reflect partial ratings instead of five filled stars', () => {
  assert.match(ratingStars(3.5), /width:70\.00%/);
  assert.match(ratingStars(3.5), /5점 만점에 3\.5점/);
  assert.match(ratingStars(5), /width:100\.00%/);
  assert.match(ratingStars(null), /width:0\.00%/);
  assert.match(ratingStars(0), /width:0\.00%/);
});
