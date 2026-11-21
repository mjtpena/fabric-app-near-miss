import type { DemoScript } from '@x10/shared/demo';

export const script: DemoScript = {
  title: 'Near-Miss: hazards on a site plan, reported in 30 seconds and fixed before anyone gets hurt',
  persona: 'demo-lead',
  scenes: [
    {
      id: 'hook',
      say: [
        'Most serious injuries at work follow near misses that someone saw and never reported, because reporting was slow or felt like telling on a colleague.',
        'Near-Miss is a Fabric App where every hazard on a site is a pin on its plan, coloured by how bad it could have been.',
      ],
      async run(h) {
        await h.goto('/');
        await h.spotlight(h.page.getByTestId('site-plan'), 4500);
        await h.hover(h.page.getByRole('button', { name: /^Serious near miss, Despatch bay/ }));
        await h.pause(2000);
      },
    },
    {
      id: 'lenses',
      say: [
        'The status lens shows what is new, triaged, or waiting on a fix; fixed hazards shrink to a check mark.',
        'The heat lens weights every report by its potential, and the loading dock is the top hotspot of the last ninety days.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: /^Status/ }));
        await h.pause(3500);
        await h.click(h.page.getByRole('radio', { name: /^Heat/ }));
        await h.spotlight(h.page.locator('[data-hotspot-rank="1"]'), 3000);
      },
    },
    {
      id: 'replay',
      say: [
        'Replay the ninety days and watch it form: forklifts and people crossing at the same dock doors, report after report.',
        'Then the barrier and the signal crossing went in, and the heat cooled away.',
      ],
      async run(h) {
        const today = h.page.getByRole('complementary', { name: 'Today' });
        await h.click(today.getByRole('button', { name: /Loading dock cooled after its fix/ }));
        await h.pause(9500);
      },
    },
    {
      id: 'today',
      say: ['Today ranks what needs attention now: a serious near miss is past its four-hour triage limit, and seven fixes are overdue.'],
      async run(h) {
        const today = h.page.getByRole('complementary', { name: 'Today' });
        await h.click(today.getByRole('button', { name: /^Serious near miss untriaged at Despatch bay/ }));
        await h.spotlight(h.page.getByTestId('pin-card'), 4000);
      },
    },
    {
      id: 'view-as',
      say: ['View it as a supervisor for your own site, or as a reporter to see your own reports and what happened to them.'],
      async run(h) {
        await h.click(h.page.getByRole('radio', { name: 'Supervisor' }));
        await h.pause(2200);
        await h.click(h.page.getByRole('radio', { name: 'Reporter' }));
        await h.pause(2200);
        await h.click(h.page.getByRole('radio', { name: 'Lead' }));
      },
    },
    {
      id: 'report',
      say: [
        'Reporting takes a few taps: where on the plan, what kind, how bad, and one sentence.',
        'Report anonymously and the name is not stored at all, so nobody, not even the safety lead, can see who sent it.',
        'The honest trade-off is that nobody can edit it afterwards, and the form says so.',
      ],
      async run(h) {
        await h.goto('/report', 'demo-sam');
        await h.select(h.page.getByLabel('or choose a zone'), 'Loading dock');
        await h.click(h.page.getByRole('radio', { name: 'Vehicles' }));
        await h.click(h.page.getByRole('radio', { name: 'High' }));
        await h.type(h.page.getByLabel('What happened'), 'Forklift reversed past the crossing while I was on it.');
        await h.click(h.page.getByRole('switch', { name: 'Report anonymously' }));
        await h.spotlight(h.page.getByTestId('anon-note'), 3500);
        await h.click(h.page.getByRole('button', { name: 'Send report' }));
        await h.spotlight(h.page.getByTestId('report-sent'), 3000);
      },
    },
    {
      id: 'triage',
      say: [
        'The site supervisor triages it, but a serious report cannot be fixed or closed until someone owns an action.',
        'Assign the fix to an owner; the due date defaults by potential, two days for serious.',
      ],
      async run(h) {
        await h.goto('/?view=list', 'demo-priya');
        await h.click(h.page.getByRole('link', { name: /dock leveller lip dropped/ }));
        await h.click(h.page.getByRole('button', { name: 'Mark triaged' }));
        await h.click(h.page.getByRole('button', { name: 'Mark fixed' }));
        await h.spotlight(h.page.getByTestId('status-error'), 3000);
        const form = h.page.getByTestId('assign-form');
        await h.type(form.getByLabel('Action'), 'Lock out the door 12 leveller until it is repaired');
        await h.select(form.getByLabel('Owner'), 'Lee Hart');
        await h.click(form.getByRole('button', { name: 'Assign action' }));
        await h.spotlight(h.page.getByTestId('action-list'), 2500);
      },
    },
    {
      id: 'toolbox',
      say: ['For the start of a shift, the toolbox talk prints one page on a zone: what was reported, what was fixed, and what to talk about.'],
      async run(h) {
        await h.goto('/toolbox');
        await h.spotlight(h.page.getByTestId('toolbox-sheet'), 4500);
        await h.scrollTo(h.page.getByText('What we fixed'));
        await h.pause(2000);
      },
    },
    {
      id: 'takeaway',
      say: ['Report it in thirty seconds, fix it before anyone gets hurt, and let the plan show you where the risk is gathering.'],
      async run(h) {
        await h.goto('/', 'demo-lead');
        await h.pause(4000);
      },
    },
  ],
};
