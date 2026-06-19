const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardMessages = require('@app/messages/creator-card');
const CreatorCard = require('@app/models/creator-card');
const { serializeCard } = require('./create');

const spec = `root {
  slug string<trim>
  access_code? string<trim>
}`;

const parsedSpec = validator.parse(spec);

async function getCreatorCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    // Rule 1: card must exist and not be deleted
    const card = await CreatorCard.findOne({ slug: data.slug, deleted: null });
    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF01',
      });
    }

    // Rule 2: draft cards are not publicly retrievable
    if (card.status === 'draft') {
      throwAppError(CreatorCardMessages.CARD_IS_DRAFT, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF02',
      });
    }

    // Rules 3 & 4: private card access control
    if (card.access_type === 'private') {
      if (!data.access_code) {
        throwAppError(CreatorCardMessages.CARD_IS_PRIVATE_NO_CODE, ERROR_CODE.FORBIDDEN, {
          businessCode: 'AC03',
        });
      }

      if (data.access_code !== card.access_code) {
        throwAppError(CreatorCardMessages.CARD_INVALID_ACCESS_CODE, ERROR_CODE.FORBIDDEN, {
          businessCode: 'AC04',
        });
      }
    }

    // access_code is NEVER returned in retrieval responses
    response = serializeCard(card, false);

    appLogger.info({ slug: data.slug }, 'creator-card-retrieved');
  } catch (error) {
    if (error.isApplicationError) throw error;
    appLogger.errorX(error, 'get-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = getCreatorCard;
