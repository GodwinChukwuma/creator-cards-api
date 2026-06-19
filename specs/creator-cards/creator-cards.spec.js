/* eslint-disable no-unused-expressions */
process.env.USE_MOCK_MODEL = '0';
process.env.PINO_LOG_LEVEL = 'silent';

const { expect } = require('chai');
const sinon = require('sinon');
const createMockServer = require('@app-core/mock-server');
const CreatorCard = require('@app/models/creator-card');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCard(overrides = {}) {
  const base = {
    _id: '01JTEST000000000000000000',
    title: 'George Cooks',
    description: 'Weekly cooking podcast',
    slug: 'george-cooks',
    creator_reference: 'crt_8f2k1m9x4p7w3q5z',
    links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
    service_rates: {
      currency: 'NGN',
      rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
    },
    status: 'published',
    access_type: 'public',
    access_code: null,
    created: 1767052800000,
    updated: 1767052800000,
    deleted: null,
    toObject() {
      return { ...this };
    },
    save: sinon.stub().callsFake(async function () { return this; }),
  };
  return { ...base, ...overrides };
}

// ─── Server ─────────────────────────────────────────────────────────────────

let server;
before(() => {
  server = createMockServer(['endpoints/creator-cards']);
});

afterEach(() => {
  sinon.restore();
});

// ─── POST /creator-cards ─────────────────────────────────────────────────────

describe('POST /creator-cards', () => {
  it('TC1 – creates a card with all fields; response uses id not _id', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);
    sinon.stub(CreatorCard, 'create').resolves(makeCard());

    const res = await server.post('/creator-cards', {
      body: {
        title: 'George Cooks',
        description: 'Weekly cooking podcast',
        slug: 'george-cooks',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
        service_rates: {
          currency: 'NGN',
          rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
        },
        status: 'published',
      },
    });

    expect(res.statusCode).to.equal(200);
    expect(res.data.status).to.equal('success');
    expect(res.data.message).to.equal('Creator Card Created Successfully.');
    expect(res.data.data).to.have.property('id');
    expect(res.data.data).to.not.have.property('_id');
    expect(res.data.data.access_type).to.equal('public');
    expect(res.data.data.slug).to.equal('george-cooks');
  });

  it('TC2 – auto-generates slug from title', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);
    sinon.stub(CreatorCard, 'create').callsFake(async (doc) =>
      makeCard({ slug: doc.slug, title: doc.title })
    );

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Ada Designs Things',
        creator_reference: 'crt_a1b2c3d4e5f6g7h8',
        status: 'published',
      },
    });

    expect(res.statusCode).to.equal(200);
    expect(res.data.data.slug).to.equal('ada-designs-things');
  });

  it('TC3 – creates a private card; access_code returned in response', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);
    sinon.stub(CreatorCard, 'create').resolves(
      makeCard({ slug: 'vip-rate-card', access_type: 'private', access_code: 'A1B2C3' })
    );

    const res = await server.post('/creator-cards', {
      body: {
        title: 'VIP Rate Card',
        creator_reference: 'crt_x9y8z7w6v5u4t3s2',
        status: 'published',
        access_type: 'private',
        access_code: 'A1B2C3',
      },
    });

    expect(res.statusCode).to.equal(200);
    expect(res.data.data.access_code).to.equal('A1B2C3');
    expect(res.data.data.access_type).to.equal('private');
  });

  it('TC7 – duplicate slug returns HTTP 400 SL02', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(makeCard());

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Another George',
        slug: 'george-cooks',
        creator_reference: 'crt_m1n2b3v4c5x6z7l8',
        status: 'published',
      },
    });

    expect(res.statusCode).to.equal(400);
    expect(res.data.status).to.equal('error');
    expect(res.data.code).to.equal('SL02');
  });

  it('TC8 – private card without access_code returns HTTP 400 AC01', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Secret Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'private',
      },
    });

    expect(res.statusCode).to.equal(400);
    expect(res.data.code).to.equal('AC01');
  });

  it('TC9 – access_code on public card returns HTTP 400 AC05', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Public Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'public',
        access_code: 'A1B2C3',
      },
    });

    expect(res.statusCode).to.equal(400);
    expect(res.data.code).to.equal('AC05');
  });

  it('TC10 – invalid status enum returns HTTP 400 (framework validator)', async () => {
    const res = await server.post('/creator-cards', {
      body: {
        title: 'Bad Status Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'archived',
      },
    });

    expect(res.statusCode).to.equal(400);
    expect(res.data.status).to.equal('error');
  });

  it('access_code on omitted access_type (defaults to public) returns HTTP 400 AC05', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Default Public Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_code: 'A1B2C3',
      },
    });

    expect(res.statusCode).to.equal(400);
    expect(res.data.code).to.equal('AC05');
  });

  it('missing required title returns HTTP 400', async () => {
    const res = await server.post('/creator-cards', {
      body: {
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
      },
    });

    expect(res.statusCode).to.equal(400);
  });

  it('link with invalid url returns HTTP 400', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Card With Bad Link',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        links: [{ title: 'Bad', url: 'ftp://notallowed.com' }],
      },
    });

    expect(res.statusCode).to.equal(400);
  });

  it('amount with decimal returns HTTP 400', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.post('/creator-cards', {
      body: {
        title: 'Card With Decimal Amount',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        service_rates: {
          currency: 'NGN',
          rates: [{ name: 'IG Story', description: 'Test', amount: 500.50 }],
        },
      },
    });

    expect(res.statusCode).to.equal(400);
  });
});

// ─── GET /creator-cards/:slug ─────────────────────────────────────────────────

describe('GET /creator-cards/:slug', () => {
  it('TC4 – retrieves a public published card; no access_code in response', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(makeCard());

    const res = await server.get('/creator-cards/george-cooks');

    expect(res.statusCode).to.equal(200);
    expect(res.data.status).to.equal('success');
    expect(res.data.message).to.equal('Creator Card Retrieved Successfully.');
    expect(res.data.data).to.have.property('id');
    expect(res.data.data).to.not.have.property('_id');
    expect(res.data.data).to.not.have.property('access_code');
  });

  it('TC5 – retrieves a private card with correct access_code; no access_code in response', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(
      makeCard({ slug: 'vip-rate-card', access_type: 'private', access_code: 'A1B2C3' })
    );

    const res = await server.get('/creator-cards/vip-rate-card?access_code=A1B2C3', {
      query: { access_code: 'A1B2C3' },
    });

    expect(res.statusCode).to.equal(200);
    expect(res.data.data).to.not.have.property('access_code');
  });

  it('TC11 – non-existent card returns HTTP 404 NF01', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.get('/creator-cards/does-not-exist-123');

    expect(res.statusCode).to.equal(404);
    expect(res.data.code).to.equal('NF01');
  });

  it('TC12 – draft card returns HTTP 404 NF02', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(makeCard({ status: 'draft' }));

    const res = await server.get('/creator-cards/my-draft-card');

    expect(res.statusCode).to.equal(404);
    expect(res.data.code).to.equal('NF02');
  });

  it('TC13 – private card without access_code returns HTTP 403 AC03', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(
      makeCard({ access_type: 'private', access_code: 'A1B2C3' })
    );

    const res = await server.get('/creator-cards/vip-rate-card');

    expect(res.statusCode).to.equal(403);
    expect(res.data.code).to.equal('AC03');
  });

  it('TC14 – private card with wrong access_code returns HTTP 403 AC04', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(
      makeCard({ access_type: 'private', access_code: 'A1B2C3' })
    );

    const res = await server.get('/creator-cards/vip-rate-card', {
      query: { access_code: 'WRONG1' },
    });

    expect(res.statusCode).to.equal(403);
    expect(res.data.code).to.equal('AC04');
  });

  it('TC16 – deleted card returns HTTP 404 NF01', async () => {
    // deleted cards are filtered by deleted:null in findOne query
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.get('/creator-cards/ada-designs-things');

    expect(res.statusCode).to.equal(404);
    expect(res.data.code).to.equal('NF01');
  });
});

// ─── DELETE /creator-cards/:slug ─────────────────────────────────────────────

describe('DELETE /creator-cards/:slug', () => {
  it('TC6 – deletes a card; returns deleted card with deleted timestamp set', async () => {
    const card = makeCard({ slug: 'ada-designs-things' });
    sinon.stub(CreatorCard, 'findOne').resolves(card);

    const res = await server.delete('/creator-cards/ada-designs-things', {
      body: { creator_reference: 'crt_a1b2c3d4e5f6g7h8' },
    });

    expect(res.statusCode).to.equal(200);
    expect(res.data.status).to.equal('success');
    expect(res.data.message).to.equal('Creator Card Deleted Successfully.');
    expect(res.data.data.deleted).to.not.equal(null);
    expect(res.data.data).to.have.property('id');
    expect(res.data.data).to.not.have.property('_id');
    // Delete response includes access_code (same format as create)
    expect(res.data.data).to.have.property('access_code');
  });

  it('TC15 – deleting non-existent card returns HTTP 404 NF01', async () => {
    sinon.stub(CreatorCard, 'findOne').resolves(null);

    const res = await server.delete('/creator-cards/does-not-exist-123', {
      body: { creator_reference: 'crt_q1w2e3r4t5y6u7i8' },
    });

    expect(res.statusCode).to.equal(404);
    expect(res.data.code).to.equal('NF01');
  });

  it('missing creator_reference returns HTTP 400', async () => {
    const res = await server.delete('/creator-cards/george-cooks', {
      body: {},
    });

    expect(res.statusCode).to.equal(400);
  });

  it('creator_reference wrong length returns HTTP 400', async () => {
    const res = await server.delete('/creator-cards/george-cooks', {
      body: { creator_reference: 'short' },
    });

    expect(res.statusCode).to.equal(400);
  });
});
