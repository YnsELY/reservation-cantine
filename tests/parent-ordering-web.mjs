// Browser integration tests. Fictional fixtures only; all external requests intercepted.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const root = process.env.UI_BASE_URL || 'http://127.0.0.1:4179';
const out =
  process.env.UI_SCREENSHOT_DIR || '/tmp/parent-ux-validation/screens';
await mkdir(out, { recursive: true });
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const day = '2026-10-05';
const parent = {
  id: id(1),
  user_id: id(101),
  first_name: 'Sarah',
  last_name: 'Test',
  email: 'fixture@example.invalid',
  school_id: id(10),
};
const schools = [
  { id: id(10), name: 'École des Oliviers', closed_weekdays: [0] },
  { id: id(11), name: 'École du Parc', closed_weekdays: [0] },
];
const children = [
  {
    id: id(20),
    parent_id: id(1),
    school_id: id(10),
    first_name: 'Alice',
    last_name: 'Test',
    grade: 'CE2',
  },
  {
    id: id(21),
    parent_id: id(1),
    school_id: id(11),
    first_name: 'Basile',
    last_name: 'Test',
    grade: 'CP',
  },
];
const photo =
  'https://wreusophfpedauznrjfl.supabase.co/storage/v1/object/public/menus/fixture.png';
const menus = [
  {
    id: id(40),
    school_id: id(10),
    meal_name: 'Poulet rôti',
    meal_category: 'classic',
    price: 40,
    image_url: photo,
    supplements: [id(50)],
  },
  {
    id: id(41),
    school_id: id(10),
    meal_name: 'Tacos poulet',
    meal_category: 'snack',
    price: 30,
    image_url: photo,
    supplements: [],
  },
  {
    id: id(42),
    school_id: id(11),
    meal_name: 'Wrap chicken',
    meal_category: 'snack',
    price: 25,
    image_url: null,
    supplements: [],
  },
  {
    id: id(43),
    school_id: id(10),
    meal_name: 'Repas du mardi',
    meal_category: 'classic',
    price: 42,
    image_url: null,
    date: '2026-10-06',
    supplements: [],
  },
].map((m) => ({
  date: day,
  ...m,
  provider_id: id(2),
  description: 'Préparé avec soin pour le déjeuner.',
  available: true,
  allergens: [],
  created_at: '2026-10-03T10:00:00Z',
}));
const supplement = {
  id: id(50),
  name: 'Compote',
  price: 5,
  available: true,
  menu_id: null,
};
const user = {
  id: id(101),
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const browser = await chromium.launch({ headless: true });
const errors = [];
let count = 0;
async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 390, height: options.height || 844 },
  });
  await context.addInitScript(
    ({ user }) =>
      localStorage.setItem(
        'sb-wreusophfpedauznrjfl-auth-token',
        JSON.stringify({
          access_token: 'test-only',
          refresh_token: 'test-only',
          expires_at: 4102444800,
          token_type: 'bearer',
          user,
        }),
      ),
    { user },
  );
  const state = {
    cart: [],
    writes: [],
    failInsert: false,
    slowInsert: false,
    ...options,
  };
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    if (url.origin === new URL(root).origin) return route.continue();
    if (url.hostname !== 'wreusophfpedauznrjfl.supabase.co')
      return route.abort();
    if (url.pathname.startsWith('/storage/'))
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    const table = url.pathname.split('/').at(-1);
    let data = [];
    if (url.pathname.includes('/auth/')) data = user;
    else if (table === 'parents') data = [parent];
    else if (table === 'children')
      data = state.singleChild ? children.slice(0, 1) : children;
    else if (table === 'schools')
      data = schools.map((s) => ({
        ...s,
        closed_weekdays: state.closed ? [1, 0] : s.closed_weekdays,
      }));
    else if (table === 'menus')
      data = state.noSnacks
        ? menus.filter((m) => m.meal_category !== 'snack')
        : menus;
    else if (table === 'provider_supplements') data = [supplement];
    else if (table === 'parent_credits')
      data = [
        {
          id: id(60),
          parent_id: parent.id,
          amount: 10,
          used_amount: 0,
          reserved_amount: 0,
          is_active: true,
        },
      ];
    else if (table === 'reservations') data = state.reservations || [];
    else if (table === 'cart_items') {
      if (method === 'POST') {
        state.writes.push(req.postDataJSON());
        if (state.slowInsert)
          await new Promise((resolve) => setTimeout(resolve, 200));
        if (state.failInsert)
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Erreur de test : réessayez',
              code: 'TEST',
            }),
          });
        state.cart.push({
          ...req.postDataJSON(),
          id: id(1000 + state.cart.length),
          created_at: new Date().toISOString(),
        });
      } else if (method === 'DELETE')
        state.cart = state.cart.filter(
          (x) => 'eq.' + x.id !== url.searchParams.get('id'),
        );
      else if (method === 'PATCH')
        for (const item of state.cart)
          if ('eq.' + item.id === url.searchParams.get('id'))
            Object.assign(item, req.postDataJSON());
      data = state.cart;
    }
    if (Array.isArray(data))
      for (const [key, value] of url.searchParams) {
        if (['select', 'order', 'limit', 'or'].includes(key)) continue;
        if (value.startsWith('eq.'))
          data = data.filter((x) => String(x[key]) === value.slice(3));
        if (value.startsWith('neq.'))
          data = data.filter((x) => String(x[key]) !== value.slice(4));
        if (value.startsWith('gte.'))
          data = data.filter((x) => String(x[key]) >= value.slice(4));
        if (value.startsWith('lte.'))
          data = data.filter((x) => String(x[key]) <= value.slice(4));
        if (value.startsWith('in.'))
          data = data.filter((x) =>
            value.slice(4, -1).split(',').includes(String(x[key])),
          );
      }
    const length = Array.isArray(data) ? data.length : 1;
    if (req.headers().accept?.includes('vnd.pgrst.object'))
      data = Array.isArray(data) ? (data[0] ?? null) : data;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(0, length - 1)}/${length}` },
      body: method === 'HEAD' ? '' : JSON.stringify(data),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(err.message));
  await page.clock.install({ time: new Date('2026-10-05T06:00:00Z') });
  const open = (path) => page.goto(root + path);
  const shot = async (name) => {
    await page.clock.runFor(450);
    await page.screenshot({
      path: `${out}/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  };
  return { context, page, state, open, shot };
}
const check = (name) => {
  count++;
  console.log(`PASS ${count}: ${name}`);
};
let active;
try {
  active = await fixture();
  const { page, state, open, shot } = active;
  await open('/(parent)');
  await page
    .getByRole('button', { name: 'Commander un repas', exact: true })
    .waitFor();
  assert.equal(
    await page.getByText('Commandes du mois', { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByText('Réservations de la semaine', { exact: true }).count(),
    1,
  );
  await page
    .getByRole('button', { name: 'Commander snackerie', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Ajouter un enfant', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Historique', exact: true }).waitFor();
  assert.match(
    await page.locator('body').innerText(),
    /Sans commande pour aujourd'hui/,
  );
  assert.match(await page.locator('body').innerText(), /Ma cagnotte/);
  assert.match(
    await page.locator('body').innerText(),
    /Utilisable sur vos prochaines commandes/,
  );
  await page.getByTestId('home-bottom-banner').waitFor();
  for (const category of ['classic', 'snack']) {
    const illustration = page.getByTestId(`home-illustration-${category}`);
    const source = await illustration.locator('img').getAttribute('src');
    assert.match(source, /home-order-illustrations/);
    assert.equal(
      await illustration.locator('img').evaluate(async (img) => {
        await img.decode();
        return img.naturalWidth > 0;
      }),
      true,
    );
  }
  await shot('01-home');
  const gauge = page.getByRole('progressbar', {
    name: 'Menus réservés cette semaine',
  });
  assert.equal(await gauge.getAttribute('aria-valuenow'), '0');
  assert.equal(await gauge.getAttribute('aria-valuemax'), '12');
  assert.equal(
    await page
      .getByTestId(`home-child-${children[0].id}`)
      .evaluate((el) => getComputedStyle(el).borderTopColor),
    'rgb(239, 68, 68)',
  );
  const ordering = await page.evaluate(() => {
    const a = document.querySelector('[data-testid=home-children-section]');
    const b = document.querySelector('[data-testid=home-weekly-gauge]');
    const shortcut = document.querySelector('[aria-label=Historique]');
    return (
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(shortcut.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  assert.equal(ordering, true);
  await page
    .getByTestId('home-children-section')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot('home-children-gauge-empty');
  check(
    'Accueil : cartes enfants historiques, jauge rétablie, statistiques mensuelles masquées',
  );
  await page
    .getByRole('button', { name: 'Commander un repas', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Commander pour Alice Test' })
    .waitFor();
  await shot('02-children');
  await page.getByRole('button', { name: 'Commander pour Alice Test' }).click();
  await page.getByRole('button', { name: 'Choisir Poulet rôti' }).waitFor();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Repas', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  assert.equal(
    await page.getByRole('button', { name: 'Choisir Tacos poulet' }).count(),
    0,
  );
  await page.getByRole('img', { name: 'Poulet rôti', exact: true }).waitFor();
  await shot('03-meals');
  check('Enfant, école et catégorie conservés ; photo fournie par le menu');
  await page.getByRole('button', { name: 'Choisir Poulet rôti' }).click();
  await page.getByRole('checkbox', { name: 'Compote, 5.00 DH' }).click();
  await page
    .getByRole('textbox', { name: 'Instructions spéciales' })
    .fill('Sans sauce');
  await shot('04-detail');
  state.slowInsert = true;
  await page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .dblclick();
  await page.getByText('C’est dans le panier !', { exact: true }).waitFor();
  assert.equal(state.cart.length, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(state.cart[0].total_price, 45);
  assert.equal(state.cart[0].supplements.items[0].name, 'Compote');
  assert.equal(state.cart[0].annotations, 'Sans sauce');
  await shot('05-added-meal');
  check('Ajout unique, suppléments et note conservés');
  await page
    .getByRole('button', { name: 'Voir la snackerie du jour', exact: true })
    .click();
  await page.getByRole('button', { name: 'Choisir Tacos poulet' }).waitFor();
  assert.match(await page.locator('body').innerText(), /Pour Alice/);
  assert.equal(
    await page
      .getByRole('tab', { name: 'Snackerie', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await shot('06-snacks');
  await page.getByRole('button', { name: 'Choisir Tacos poulet' }).click();
  await page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await page
    .getByText('Déjà commandé pour cet enfant', { exact: true })
    .waitFor();
  assert.equal(state.cart.length, 1);
  await shot('07-repeat');
  await page.getByText('Annuler', { exact: true }).click();
  assert.equal(state.cart.length, 1);
  await page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await page.getByText('Confirmer le repas en plus', { exact: true }).click();
  await page.getByText('C’est dans le panier !', { exact: true }).waitFor();
  assert.equal(state.cart.length, 2);
  assert.equal(state.cart[1].confirmed_daily_quantity, 2);
  assert.equal(state.cart[1].child_id, id(20));
  assert.equal(state.cart[1].date, day);
  await shot('08-added-snack');
  check('Repas + snack : confirmation obligatoire et même enfant/date');
  await page
    .getByRole('button', {
      name: 'Commander pour un autre enfant',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Commander pour Basile Test' })
    .click();
  await page.getByRole('button', { name: 'Choisir Wrap chicken' }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Choisir Tacos poulet' }).count(),
    0,
  );
  assert.match(await page.locator('body').innerText(), /École du Parc/);
  await shot('09-other-child');
  check('Changement d’enfant : nouvelle école, catégorie et panier conservés');
  await page.getByRole('button', { name: 'Choisir Wrap chicken' }).click();
  await page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await page.getByText('C’est dans le panier !', { exact: true }).waitFor();
  assert.equal(state.cart.length, 3);
  assert.equal(state.cart[2].confirmed_daily_quantity, 1);
  await page
    .getByRole('button', { name: 'Aller au panier', exact: true })
    .click();
  await page.getByText('Mon panier', { exact: true }).waitFor();
  await page.getByText('Compote (+5.00 DH)', { exact: false }).waitFor();
  await page.getByText('Sans sauce', { exact: true }).waitFor();
  const cartTotal = page
    .getByText('Total à payer', { exact: true })
    .locator('..');
  await cartTotal.getByText('90.00 DH', { exact: true }).waitFor();
  await page.getByRole('switch', { name: 'Utiliser ma cagnotte' }).click();
  await cartTotal.getByText('100.00 DH', { exact: true }).waitFor();
  await shot('10-cart');
  check('Panier mixte : détails, notes, total et cagnotte');
  await page
    .getByRole('button', { name: 'Retirer Wrap chicken pour Basile' })
    .click();
  await page.getByText('OK', { exact: true }).click();
  assert.equal(state.cart.length, 2);
  check('Suppression du panier conservée');
  await open(
    '/(parent)/reservation?childId=' +
      id(20) +
      '&date=2026-10-06&category=snack',
  );
  await page.getByText('Pas de snackerie ce jour', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Voir les repas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Choisir Repas du mardi' }).waitFor();
  await page.getByRole('button', { name: 'Changer d’enfant' }).click();
  await page.getByRole('button', { name: 'Commander pour Alice Test' }).click();
  await page.getByRole('button', { name: 'Choisir Repas du mardi' }).waitFor();
  check('Date préservée après catégorie vide et retour au choix de l’enfant');
  await page.setViewportSize({ width: 1140, height: 800 });
  await shot('11-tablet');
  await page.getByText('VOTRE COMMANDE', { exact: true }).waitFor();
  check('Disposition tablette et panier latéral');
  await page.getByRole('button', { name: 'Choisir Repas du mardi' }).click();
  await page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Aller au panier', exact: true })
    .click();
  await page
    .getByText('Repas du mardi', { exact: true })
    .filter({ visible: true })
    .waitFor();
  assert.equal(
    await page
      .getByText('Alice Test', { exact: true })
      .filter({ visible: true })
      .count(),
    2,
  );
  assert.match(await page.locator('body').innerText(), /mardi 6 octobre/);
  check('Panier regroupé par enfant et par date');
  await active.context.close();

  active = await fixture({
    singleChild: true,
    noSnacks: true,
    width: 320,
    height: 568,
  });
  await active.open(
    '/(parent)/menu-details?menuId=' +
      id(40) +
      '&childId=' +
      id(20) +
      '&date=' +
      day,
  );
  active.state.failInsert = true;
  await active.page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await active.page.getByRole('alert').waitFor();
  assert.equal(
    await active.page
      .getByText('C’est dans le panier !', { exact: true })
      .count(),
    0,
  );
  assert.equal(active.state.cart.length, 0);
  active.state.failInsert = false;
  await active.page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await active.page
    .getByText('C’est dans le panier !', { exact: true })
    .waitFor();
  assert.equal(
    await active.page
      .getByRole('button', { name: 'Voir la snackerie du jour' })
      .count(),
    0,
  );
  assert.equal(
    await active.page
      .getByRole('button', { name: 'Commander pour un autre enfant' })
      .count(),
    0,
  );
  await active.shot('12-small-success');
  check(
    'Échec sans fausse confirmation, nouvel essai, choix adaptés à la disponibilité',
  );
  await active.context.close();

  active = await fixture();
  await active.open(
    '/(parent)/menu-details?menuId=' +
      id(41) +
      '&childId=' +
      id(20) +
      '&date=' +
      day,
  );
  await active.page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .waitFor();
  await active.page.clock.setSystemTime(new Date('2026-10-05T07:00:00Z'));
  await active.page
    .getByRole('button', { name: 'Ajouter au panier', exact: true })
    .click();
  await active.page.getByRole('alert').waitFor();
  assert.equal(active.state.writes.length, 0);
  check('Snackerie bloquée à la même heure limite que les repas');
  await active.context.close();

  active = await fixture({ closed: true });
  await active.open(
    '/(parent)/reservation?childId=' +
      id(20) +
      '&date=' +
      day +
      '&category=snack',
  );
  await active.page
    .getByText('Pas de service ce jour', { exact: true })
    .waitFor();
  assert.equal(
    await active.page
      .getByRole('button', { name: 'Choisir Tacos poulet' })
      .count(),
    0,
  );
  check('Fermeture de l’école respectée pour les deux catégories');
  await active.context.close();

  active = await fixture({
    reservations: [
      {
        id: id(80),
        parent_id: parent.id,
        child_id: children[0].id,
        date: day,
        total_price: 40,
        payment_status: 'paid',
        children: children[0],
        menus: menus[0],
      },
      {
        id: id(81),
        parent_id: parent.id,
        child_id: children[0].id,
        date: '2026-10-06',
        total_price: 42,
        payment_status: 'cancelled',
        children: children[0],
        menus: menus[3],
      },
      {
        id: id(82),
        parent_id: parent.id,
        child_id: children[1].id,
        date: day,
        total_price: 25,
        payment_status: 'paid',
        children: children[1],
        menus: menus[2],
      },
    ],
  });
  await active.open('/(parent)');
  await active.page
    .getByTestId(`home-reservations-${children[0].id}`)
    .waitFor();
  assert.match(
    await active.page
      .getByTestId(`home-reservations-${children[0].id}`)
      .innerText(),
    /Poulet rôti/,
  );
  assert.match(
    await active.page
      .getByTestId(`home-reservations-${children[0].id}`)
      .innerText(),
    /Annulé/,
  );
  assert.match(
    await active.page
      .getByTestId(`home-reservations-${children[1].id}`)
      .innerText(),
    /Wrap chicken/,
  );
  assert.match(
    await active.page.locator('body').innerText(),
    /Tout est commandé/,
  );
  assert.match(
    await active.page.locator('body').innerText(),
    /Préparé avec soin/,
  );
  const populatedGauge = active.page.getByRole('progressbar', {
    name: 'Menus réservés cette semaine',
  });
  assert.equal(await populatedGauge.getAttribute('aria-valuenow'), '2');
  assert.equal(await populatedGauge.getAttribute('aria-valuemax'), '12');
  assert.equal(
    await active.page
      .getByTestId(`home-child-${children[0].id}`)
      .evaluate((el) => getComputedStyle(el).borderTopColor),
    'rgb(245, 158, 11)',
  );
  await active.page
    .getByTestId('home-children-section')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await active.shot('home-children-gauge-booked');

  await active.page
    .getByText('Prochaines réservations', { exact: true })
    .scrollIntoViewIfNeeded();
  await active.shot('home-restored-reservations');
  for (const [label, suffix] of [
    ['Historique', '/history'],
    ['Ajouter un enfant', '/add-child'],
    ['Voir la fiche de Alice Test', '/child-details'],
  ]) {
    await active.page.getByRole('button', { name: label, exact: true }).click();
    await active.page.waitForURL((url) => url.pathname.endsWith(suffix));
    await active.open('/(parent)');
    await active.page
      .getByRole('button', { name: 'Commander un repas', exact: true })
      .waitFor();
  }
  check(
    'Accueil complet : illustrations, raccourcis, rappels et réservations regroupées',
  );
  await active.context.close();

  active = await fixture({
    width: 320,
    reservations: [
      ...[5, 6, 7, 8, 9].map((number, index) => ({
        id: id(90 + index),
        parent_id: parent.id,
        child_id: children[0].id,
        date: `2026-10-${String(number).padStart(2, '0')}`,
        total_price: 40,
        payment_status: 'paid',
        children: children[0],
        menus: menus[0],
      })),
      {
        id: id(95),
        parent_id: parent.id,
        child_id: children[0].id,
        date: day,
        total_price: 30,
        payment_status: 'paid',
        children: children[0],
        menus: menus[1],
      },
    ],
  });
  await active.open('/(parent)');
  const fullGauge = active.page.getByRole('progressbar', {
    name: 'Menus réservés cette semaine',
  });
  await fullGauge.waitFor();
  assert.equal(await fullGauge.getAttribute('aria-valuenow'), '5');
  assert.equal(await fullGauge.getAttribute('aria-valuemax'), '12');
  assert.equal(
    await active.page
      .getByTestId(`home-child-${children[0].id}`)
      .evaluate((el) => getComputedStyle(el).borderTopColor),
    'rgb(16, 185, 129)',
  );
  assert.equal(
    await active.page
      .getByTestId(`home-child-${children[1].id}`)
      .evaluate((el) => getComputedStyle(el).borderTopColor),
    'rgb(239, 68, 68)',
  );
  await active.page
    .getByTestId('home-children-section')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await active.shot('home-children-gauge-small');
  await active.page
    .getByRole('button', { name: 'Voir la fiche de Basile Test' })
    .click();
  await active.page.waitForURL(
    (url) =>
      url.pathname.endsWith('/child-details') &&
      url.searchParams.get('childId') === children[1].id,
  );
  check(
    'Jauge et bordures : repas + snack dédupliqués, annulations exclues, cartes horizontales sur petit écran',
  );
  await active.context.close();

  for (const width of [320, 360, 390, 430]) {
    active = await fixture({ width });
    await active.open('/(parent)');
    await active.page
      .getByRole('button', { name: 'Commander snackerie', exact: true })
      .waitFor();
    await active.shot(`home-${width}`);
    await active.page
      .getByRole('button', { name: 'Commander snackerie', exact: true })
      .click();
    await active.page
      .getByRole('button', { name: 'Commander pour Alice Test' })
      .click();
    await active.page
      .getByRole('button', { name: 'Choisir Tacos poulet' })
      .waitFor();
    assert.equal(
      await active.page
        .getByRole('tab', { name: 'Snackerie', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      await active.page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await active.shot(`mobile-${width}`);
    await active.context.close();
  }
  check('Entrée directe snackerie, largeurs mobiles 320 / 360 / 390 / 430');
  assert.deepEqual(errors, []);
  console.log(
    `${count} scénarios validés ; aucune erreur JavaScript ; aucun accès métier réel.`,
  );
} catch (err) {
  console.error(err);
  if (active) {
    console.error(
      (await active.page.locator('body').innerText()).slice(0, 6000),
    );
    await active.shot('failure');
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
