import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientsList } from './clients-list';

describe('ClientsList', () => {
  let component: ClientsList;
  let fixture: ComponentFixture<ClientsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientsList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClientsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
