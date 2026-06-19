const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const { ulid, randomBytes } = require('@app-core/randomness');
const CreatorCardMessages = require('@app/messages/creator-card');
const CreatorCard = require('@app/models/creator-card');

const spec = `root {
  title string<trim|minLength:3|maxLength:100>
  description? string<trim|maxLength:500>
  slug? string<trim|minLength:5|maxLength:50>
  creator_reference string<trim|length:20>
  links[]? {
    title string<trim|minLength:1|maxLength:100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<trim|minLength:3|maxLength:100>
      description? string<trim|maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<trim>
}`;

const parsedSpec = validator.parse(spec);

/**
 * Serialize a MongoDB doc to API response shape (id, no _id, no access_code in retrieval)
 */
function serializeCard(doc, includeAccessCode = true) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  const card = {
    id: obj._id,
    title: obj.title,
    description: obj.description !== undefined ? obj.description : null,
    slug: obj.slug,
    creator_reference: obj.creator_reference,
    links: obj.links || [],
    service_rates: obj.service_rates || null,
    status: obj.status,
    access_type: obj.access_type,
    created: obj.created,
    updated: obj.updated,
    deleted: obj.deleted !== undefined ? obj.deleted : null,
  };

  if (includeAccessCode) {
    card.access_code = obj.access_code || null;
  }

  return card;
}

/**
 * Generate a slug from a title
 */
function titleToSlug(title) {
  let slug = title.toLowerCase();
  // Replace whitespace with hyphens
  slug = slug.split(' ').join('-');
  slug = slug.split('\t').join('-');
  // Remove chars that are not letters, numbers, hyphens, underscores
  let clean = '';
  for (let i = 0; i < slug.length; i += 1) {
    const c = slug[i];
    const code = slug.charCodeAt(i);
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isHyphen = c === '-';
    const isUnderscore = c === '_';
    if (isLower || isDigit || isHyphen || isUnderscore) {
      clean += c;
    }
  }
  return clean;
}

/**
 * Generate a random 6-char alphanumeric suffix
 */
function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    result += chars[bytes.charCodeAt(i) % chars.length];
  }
  return result;
}

async function createCreatorCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    const effectiveAccessType = data.access_type || 'public';

    // Business rule: access_code required when private
    if (effectiveAccessType === 'private' && !data.access_code) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED_FOR_PRIVATE, ERROR_CODE.INVLDDATA, {
        businessCode: 'AC01',
      });
    }

    // Business rule: access_code must not be set on public cards
    if (effectiveAccessType !== 'private' && data.access_code) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_NOT_ALLOWED_ON_PUBLIC, ERROR_CODE.INVLDDATA, {
        businessCode: 'AC05',
      });
    }

    // Validate access_code format if provided
    if (data.access_code) {
      const code = data.access_code;
      if (code.length !== 6) {
        throwAppError('access_code must be exactly 6 alphanumeric characters', ERROR_CODE.INVLDDATA, {
          businessCode: 'AC01',
        });
      }
      for (let i = 0; i < code.length; i += 1) {
        const ch = code.charCodeAt(i);
        const isAlpha = (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
        const isDigit = ch >= 48 && ch <= 57;
        if (!isAlpha && !isDigit) {
          throwAppError('access_code must be exactly 6 alphanumeric characters', ERROR_CODE.INVLDDATA, {
            businessCode: 'AC01',
          });
        }
      }
    }

    // Validate link URLs
    if (data.links && data.links.length > 0) {
      for (let i = 0; i < data.links.length; i += 1) {
        const link = data.links[i];
        if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
          throwAppError(
            `links[${i}].url must start with http:// or https://`,
            ERROR_CODE.INVLDDATA
          );
        }
      }
    }

    // Validate service_rates amount is integer
    if (data.service_rates && data.service_rates.rates) {
      for (let i = 0; i < data.service_rates.rates.length; i += 1) {
        const rate = data.service_rates.rates[i];
        if (!Number.isInteger(rate.amount) || rate.amount < 1) {
          throwAppError(
            `service_rates.rates[${i}].amount must be a positive integer`,
            ERROR_CODE.INVLDDATA
          );
        }
      }
    }

    // Slug logic
    let slug;
    const clientProvidedSlug = !!data.slug;

    if (clientProvidedSlug) {
      slug = data.slug;
      // Validate slug format
      for (let i = 0; i < slug.length; i += 1) {
        const ch = slug.charCodeAt(i);
        const isAlpha = (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
        const isDigit = ch >= 48 && ch <= 57;
        const isHyphen = slug[i] === '-';
        const isUnderscore = slug[i] === '_';
        if (!isAlpha && !isDigit && !isHyphen && !isUnderscore) {
          throwAppError(
            'slug may only contain letters, numbers, hyphens, and underscores',
            ERROR_CODE.INVLDDATA
          );
        }
      }

      const existing = await CreatorCard.findOne({ slug, deleted: null });
      if (existing) {
        throwAppError(CreatorCardMessages.SLUG_TAKEN, ERROR_CODE.INVLDDATA, {
          businessCode: 'SL02',
        });
      }
    } else {
      // Auto-generate slug from title
      slug = titleToSlug(data.title);

      const isTooShort = slug.length < 5;
      const alreadyTaken = !isTooShort
        ? await CreatorCard.findOne({ slug, deleted: null })
        : null;

      if (isTooShort || alreadyTaken) {
        slug = `${slug}-${randomSuffix()}`;
        // Ensure it's not taken (extremely unlikely collision but handle it)
        let collision = await CreatorCard.findOne({ slug, deleted: null });
        let attempts = 0;
        while (collision && attempts < 5) {
          slug = `${titleToSlug(data.title)}-${randomSuffix()}`;
          // eslint-disable-next-line no-await-in-loop
          collision = await CreatorCard.findOne({ slug, deleted: null });
          attempts += 1;
        }
      }
    }

    const now = Date.now();
    const id = ulid();

    const doc = await CreatorCard.create({
      _id: id,
      title: data.title,
      description: data.description || null,
      slug,
      creator_reference: data.creator_reference,
      links: data.links || [],
      service_rates: data.service_rates || null,
      status: data.status,
      access_type: effectiveAccessType,
      access_code: data.access_code || null,
      created: now,
      updated: now,
      deleted: null,
    });

    response = serializeCard(doc, true);

    appLogger.info({ slug: response.slug, id: response.id }, 'creator-card-created');
  } catch (error) {
    if (error.isApplicationError) throw error;
    appLogger.errorX(error, 'create-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = { createCreatorCard, serializeCard };
