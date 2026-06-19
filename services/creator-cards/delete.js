const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const CreatorCardMessages = require('@app/messages/creator-card');
const CreatorCard = require('@app/models/creator-card');
const { serializeCard } = require('./create');

const spec = `root {
  slug string<trim>
  creator_reference string<trim|length:20>
}`;

const parsedSpec = validator.parse(spec);

async function deleteCreatorCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedSpec);

  try {
    const card = await CreatorCard.findOne({ slug: data.slug, deleted: null });
    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, {
        businessCode: 'NF01',
      });
    }

    const now = Date.now();
    card.deleted = now;
    card.updated = now;
    await card.save();

    // Return in creation response format (includes access_code)
    response = serializeCard(card, true);

    appLogger.info({ slug: data.slug }, 'creator-card-deleted');
  } catch (error) {
    if (error.isApplicationError) throw error;
    appLogger.errorX(error, 'delete-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = deleteCreatorCard;
