import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CasesList } from './cases-list';

describe('CasesList', () => {
  let component: CasesList;
  let fixture: ComponentFixture<CasesList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CasesList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CasesList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
