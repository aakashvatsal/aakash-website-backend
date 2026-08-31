import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';

import { CreateMemoryPersonDto } from './dto/create-memory-person.dto';
import { MemoryPersonQueryDto } from './dto/memory-person-query.dto';
import { UpdateMemoryPersonDto } from './dto/update-memory-person.dto';
import {
  MemoryPerson,
  MemoryPersonDocument,
  PersonContactReferenceSource,
  PersonIdentityStatus,
} from './schemas/memory-person.schema';
import {
  PersonVerificationSession,
  PersonVerificationSessionDocument,
  VerificationSessionStatus,
} from './schemas/person-verification-session.schema';

@Injectable()
export class MemoryPeopleService implements OnModuleInit {
  private readonly logger = new Logger(MemoryPeopleService.name);

  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly memoryPersonModel: Model<MemoryPersonDocument>,

    @InjectModel(PersonVerificationSession.name)
    private readonly verificationSessionModel: Model<PersonVerificationSessionDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureLinkedUserIdentityIndex();
  }

  async create(dto: CreateMemoryPersonDto) {
    // this.validateObjectId(
    //   dto.ownerUserId,
    //   'owner user ID',
    // );

    if (dto.linkedUserId) {
      this.validateObjectId(dto.linkedUserId, 'linked user ID');
    }

    // const ownerUserId =
    //   new Types.ObjectId(dto.ownerUserId);

    const emails = this.prepareEmails(dto.emails);
    const phoneNumbers = this.preparePhones(dto.phoneNumbers);

    await this.assertNoIdentityDuplicate(
      emails,
      phoneNumbers,
      undefined,
      dto.linkedUserId ?? undefined,
    );

    try {
      return await this.memoryPersonModel.create({
        // ownerUserId,
        linkedUserId: dto.linkedUserId
          ? new Types.ObjectId(dto.linkedUserId)
          : null,
        name: dto.name.trim(),
        preferredName: dto.preferredName?.trim(),
        relationship: dto.relationship,
        relationshipLabel: dto.relationshipLabel?.trim(),
        emails,
        phoneNumbers,
        aliases: this.normalizeAliases(dto.aliases),
        tags: this.normalizeTags(dto.tags),
        organizationName: this.cleanOptionalText(dto.organizationName),
        roleTitle: this.cleanOptionalText(dto.roleTitle),
        department: this.cleanOptionalText(dto.department),
        location: this.cleanOptionalText(dto.location),
        importance: dto.importance ?? 3,
        firstMetAt: this.parseOptionalDate(dto.firstMetAt, 'first met date'),
        lastInteractionAt: this.parseOptionalDate(
          dto.lastInteractionAt,
          'last interaction date',
        ),
        contactReferences: this.prepareContactReferences(dto.contactReferences),
        notes: this.cleanOptionalText(dto.notes),
        metadata: dto.metadata ?? {},
      });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async findAll(query: MemoryPersonQueryDto) {
    // this.validateObjectId(
    //   query.ownerUserId,
    //   'owner user ID',
    // );

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: QueryFilter<MemoryPersonDocument> = {
      // ownerUserId: new Types.ObjectId(
      //   query.ownerUserId,
      // ),
      isActive: query.isActive ?? true,
    };

    if (query.relationship) {
      filter.relationship = query.relationship;
    }

    if (query.identityStatus) {
      filter.identityStatus = query.identityStatus;
    }

    if (query.organizationName?.trim()) {
      filter.organizationName = this.caseInsensitiveExact(
        query.organizationName,
      );
    }

    if (query.tag?.trim()) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    if (query.minImportance !== undefined) {
      filter.importance = { $gte: query.minImportance };
    }

    if (query.isBlocked !== undefined) {
      filter.isBlocked = query.isBlocked;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      const search = this.containsRegex(query.search);
      filter.$or = [
        { name: search },
        { preferredName: search },
        { aliases: search },
        { tags: search },
        { relationshipLabel: search },
        { organizationName: search },
        { roleTitle: search },
        { department: search },
        { location: search },
        { 'emails.email': search },
        { 'phoneNumbers.phoneNumber': search },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.memoryPersonModel
        .find(filter)
        .sort({
          importance: -1,
          lastInteractionAt: -1,
          name: 1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.memoryPersonModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.lastAccessedAt = new Date();
    await person.save();

    return person.toObject();
  }

  async searchDirectory(search?: string, limit = 10) {
    const response = await this.findAll({
      search,
      page: 1,
      limit: Math.min(Math.max(limit, 1), 25),
      isArchived: false,
      isActive: true,
    });

    return {
      query: search?.trim() ?? '',
      people: response.data.map((person) => this.toHsakaaSummary(person)),
      total: response.pagination.total,
    };
  }

  async resolveExactPerson(query: string) {
    const normalized = query.trim();
    if (!normalized) {
      throw new BadRequestException('Person name is required.');
    }

    const exact = this.caseInsensitiveExact(normalized);
    const matches = await this.memoryPersonModel
      .find({
        isActive: true,
        isArchived: false,
        $or: [{ name: exact }, { preferredName: exact }, { aliases: exact }],
      })
      .sort({ importance: -1, name: 1 })
      .limit(5)
      .lean();

    if (matches.length !== 1) {
      return {
        status: matches.length ? 'ambiguous' : 'not_found',
        query: normalized,
        matches: matches.map((person) => this.toHsakaaSummary(person)),
      };
    }

    return {
      status: 'resolved',
      query: normalized,
      person: this.toHsakaaProfile(matches[0]),
    };
  }

  async update(
    personId: string,
    // ownerUserId: string,
    dto: UpdateMemoryPersonDto,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    let identityChanged = false;

    if (dto.name !== undefined) {
      person.name = dto.name.trim();
    }

    if (dto.preferredName !== undefined) {
      person.preferredName = dto.preferredName?.trim();
    }

    if (dto.relationship !== undefined) {
      person.relationship = dto.relationship;
    }

    if (dto.relationshipLabel !== undefined) {
      person.relationshipLabel = dto.relationshipLabel?.trim();
    }

    if (dto.organizationName !== undefined) {
      person.organizationName = this.cleanOptionalText(dto.organizationName);
    }

    if (dto.roleTitle !== undefined) {
      person.roleTitle = this.cleanOptionalText(dto.roleTitle);
    }

    if (dto.department !== undefined) {
      person.department = this.cleanOptionalText(dto.department);
    }

    if (dto.location !== undefined) {
      person.location = this.cleanOptionalText(dto.location);
    }

    if (dto.importance !== undefined) {
      person.importance = dto.importance;
    }

    if (dto.firstMetAt !== undefined) {
      person.firstMetAt = this.parseOptionalDate(
        dto.firstMetAt,
        'first met date',
      );
    }

    if (dto.lastInteractionAt !== undefined) {
      person.lastInteractionAt = this.parseOptionalDate(
        dto.lastInteractionAt,
        'last interaction date',
      );
    }

    if (dto.contactReferences !== undefined) {
      person.contactReferences = this.prepareContactReferences(
        dto.contactReferences,
      );
    }

    if (dto.notes !== undefined) {
      person.notes = dto.notes?.trim();
    }

    if (dto.metadata !== undefined) {
      person.metadata = dto.metadata;
    }

    if (dto.aliases !== undefined) {
      person.aliases = this.normalizeAliases(dto.aliases);
    }

    if (dto.tags !== undefined) {
      person.tags = this.normalizeTags(dto.tags);
    }

    if (dto.linkedUserId !== undefined) {
      person.linkedUserId = dto.linkedUserId
        ? new Types.ObjectId(dto.linkedUserId)
        : null;
      identityChanged = true;
    }

    if (dto.emails !== undefined) {
      person.emails = this.prepareEmails(dto.emails);

      identityChanged = true;
    }

    if (dto.phoneNumbers !== undefined) {
      person.phoneNumbers = this.preparePhones(dto.phoneNumbers);

      identityChanged = true;
    }

    if (identityChanged) {
      await this.assertNoIdentityDuplicate(
        person.emails,
        person.phoneNumbers,
        person._id,
        person.linkedUserId?.toString(),
      );
      person.identityVersion += 1;
      person.identityStatus = PersonIdentityStatus.UNVERIFIED;

      await this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status: {
            $in: [
              VerificationSessionStatus.PENDING,
              VerificationSessionStatus.VERIFIED,
            ],
          },
        },
        {
          $set: {
            status: VerificationSessionStatus.REVOKED,
          },
        },
      );
    }

    try {
      await person.save();
    } catch (error) {
      this.rethrowPersistenceError(error);
    }

    return person;
  }

  async grantConsent(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.memoryAccessConsentGranted = true;
    person.memoryAccessConsentGrantedAt = new Date();
    person.memoryAccessConsentRevokedAt = undefined;

    await person.save();

    return person;
  }

  async revokeConsent(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.memoryAccessConsentGranted = false;
    person.memoryAccessConsentRevokedAt = new Date();
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status: VerificationSessionStatus.VERIFIED,
        },
        {
          $set: {
            status: VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return person;
  }

  async block(
    personId: string,
    // ownerUserId: string,
    reason?: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isBlocked = true;
    person.blockedReason = reason?.trim() || 'Blocked by owner';
    person.identityStatus = PersonIdentityStatus.BLOCKED;
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
          status: {
            $in: [
              VerificationSessionStatus.PENDING,
              VerificationSessionStatus.VERIFIED,
            ],
          },
        },
        {
          $set: {
            status: VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return person;
  }

  async unblock(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isBlocked = false;
    person.blockedReason = undefined;
    person.identityStatus = PersonIdentityStatus.UNVERIFIED;
    person.identityVersion += 1;

    await person.save();

    return person;
  }

  async archive(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isArchived = true;

    await person.save();

    return person;
  }

  async restore(
    personId: string,
    // ownerUserId: string,
  ) {
    this.validateObjectId(personId, 'person ID');
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const person = await this.memoryPersonModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(personId),
          // ownerUserId: new Types.ObjectId(
          //   ownerUserId,
          // ),
          isActive: true,
        },
        {
          $set: {
            isArchived: false,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!person) {
      throw new NotFoundException('Memory person not found.');
    }

    return person;
  }

  async remove(
    personId: string,
    // ownerUserId: string,
  ) {
    const person = await this.getDocument(
      personId,
      // ownerUserId,
    );

    person.isActive = false;
    person.isArchived = true;
    person.identityVersion += 1;

    await Promise.all([
      person.save(),

      this.verificationSessionModel.updateMany(
        {
          personId: person._id,
          // ownerUserId: person.ownerUserId,
        },
        {
          $set: {
            status: VerificationSessionStatus.REVOKED,
          },
        },
      ),
    ]);

    return {
      message: 'Memory person deleted successfully.',
    };
  }

  async getDocument(
    personId: string,
    // ownerUserId: string,
  ) {
    this.validateObjectId(personId, 'person ID');
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const person = await this.memoryPersonModel.findOne({
      _id: new Types.ObjectId(personId),
      // ownerUserId: new Types.ObjectId(
      //   ownerUserId,
      // ),
      isActive: true,
    });

    if (!person) {
      throw new NotFoundException('Memory person not found.');
    }

    return person;
  }

  private async ensureLinkedUserIdentityIndex() {
    try {
      const indexes = await this.memoryPersonModel.collection.indexes();
      const desiredName = 'memory_people_linked_user_active_unique';

      for (const index of indexes) {
        const keys = index.key ?? {};
        const containsLinkedUserId = keys.linkedUserId === 1;
        if (!containsLinkedUserId || index.name === desiredName) {
          continue;
        }

        if (index.name) {
          await this.memoryPersonModel.collection.dropIndex(index.name);
        }
      }

      const desired = indexes.find((index) => index.name === desiredName);
      const hasDesiredOptions =
        desired?.unique === true &&
        this.hasDesiredLinkedUserPartialFilter(desired.partialFilterExpression);

      if (desired && !hasDesiredOptions && desired.name) {
        await this.memoryPersonModel.collection.dropIndex(desired.name);
      }

      if (!desired || !hasDesiredOptions) {
        await this.memoryPersonModel.collection.createIndex(
          { linkedUserId: 1 },
          {
            name: desiredName,
            unique: true,
            partialFilterExpression: {
              linkedUserId: { $type: 'objectId' },
              isActive: true,
            },
          },
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not reconcile memory_people linked-user index: ${this.errorMessage(error)}`,
      );
    }
  }

  private hasDesiredLinkedUserPartialFilter(value: unknown) {
    if (!this.isRecord(value)) {
      return false;
    }

    const linkedUserId = value.linkedUserId;
    return (
      this.isRecord(linkedUserId) &&
      linkedUserId.$type === 'objectId' &&
      value.isActive === true
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private rethrowPersistenceError(error: unknown): never {
    if (this.mongoErrorCode(error) === 11000) {
      throw new ConflictException(
        'A person with this linked account, email, or phone identity already exists.',
      );
    }

    if (this.errorName(error) === 'ValidationError') {
      throw new BadRequestException(this.errorMessage(error));
    }

    throw error;
  }

  private mongoErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return undefined;
    }
    return (error as { code?: number }).code;
  }

  private errorName(error: unknown) {
    if (!error || typeof error !== 'object' || !('name' in error)) {
      return undefined;
    }
    return (error as { name?: string }).name;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private prepareEmails(
    emails?: Array<{
      email: string;
      isPrimary?: boolean;
    }>,
  ) {
    return (emails ?? []).map((item, index) => ({
      email: this.normalizeEmail(item.email),
      isVerified: false,
      isPrimary: item.isPrimary ?? (emails?.length === 1 || index === 0),
    }));
  }

  private preparePhones(
    phoneNumbers?: Array<{
      phoneNumber: string;
      countryCode?: string;
      isPrimary?: boolean;
    }>,
  ) {
    return (phoneNumbers ?? []).map((item, index) => ({
      phoneNumber: this.normalizePhone(item.phoneNumber, item.countryCode),
      countryCode: item.countryCode?.trim(),
      isVerified: false,
      isPrimary: item.isPrimary ?? (phoneNumbers?.length === 1 || index === 0),
    }));
  }

  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  normalizePhone(phone: string, countryCode?: string) {
    const raw = phone.trim();
    const withCountry =
      raw.startsWith('+') || !countryCode?.trim()
        ? raw
        : `${countryCode.trim()}${raw}`;
    const normalized = withCountry.replace(/[^\d+]/g, '');

    if (!normalized.startsWith('+') || !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException(
        'Phone number must use valid E.164 format, for example +919876543210.',
      );
    }

    return normalized;
  }

  private async assertNoIdentityDuplicate(
    emails: Array<{ email: string }>,
    phoneNumbers: Array<{ phoneNumber: string }>,
    excludePersonId?: Types.ObjectId,
    linkedUserId?: string,
  ) {
    const identityFilters: QueryFilter<MemoryPersonDocument>[] = [];

    if (emails.length) {
      identityFilters.push({
        'emails.email': { $in: emails.map((item) => item.email) },
      });
    }

    if (phoneNumbers.length) {
      identityFilters.push({
        'phoneNumbers.phoneNumber': {
          $in: phoneNumbers.map((item) => item.phoneNumber),
        },
      });
    }

    if (linkedUserId) {
      this.validateObjectId(linkedUserId, 'linked user ID');
      identityFilters.push({
        linkedUserId: new Types.ObjectId(linkedUserId),
      });
    }

    if (!identityFilters.length) {
      return;
    }

    const duplicate = await this.memoryPersonModel.exists({
      isActive: true,
      ...(excludePersonId ? { _id: { $ne: excludePersonId } } : {}),
      $or: identityFilters,
    });

    if (duplicate) {
      throw new ConflictException(
        'A person with this email or phone number already exists.',
      );
    }
  }

  private prepareContactReferences(
    references?: Array<{
      source: PersonContactReferenceSource;
      externalId?: string;
      label?: string;
      url?: string;
    }>,
  ) {
    const seen = new Set<string>();

    return (references ?? [])
      .map((reference) => ({
        source: reference.source ?? PersonContactReferenceSource.MANUAL,
        externalId: this.cleanOptionalText(reference.externalId),
        label: this.cleanOptionalText(reference.label),
        url: this.cleanOptionalText(reference.url),
      }))
      .filter((reference) => {
        if (!reference.externalId && !reference.url && !reference.label) {
          return false;
        }
        const key = `${reference.source}|${reference.externalId ?? ''}|${
          reference.url ?? ''
        }|${reference.label ?? ''}`.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private normalizeAliases(values?: string[]) {
    return [
      ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    ];
  }

  private cleanOptionalText(value?: string) {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private parseOptionalDate(value: string | undefined, fieldName: string) {
    if (!value?.trim()) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
    return parsed;
  }

  private caseInsensitiveExact(value: string) {
    return new RegExp(`^${this.escapeRegex(value.trim())}$`, 'i');
  }

  private containsRegex(value: string) {
    return new RegExp(this.escapeRegex(value.trim()), 'i');
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toHsakaaSummary(person: MemoryPerson & { _id: Types.ObjectId }) {
    return {
      personId: person._id.toString(),
      name: person.preferredName || person.name,
      fullName: person.name,
      aliases: person.aliases ?? [],
      relationship: person.relationship,
      relationshipLabel: person.relationshipLabel,
      organizationName: person.organizationName,
      roleTitle: person.roleTitle,
      department: person.department,
      location: person.location,
      importance: person.importance ?? 3,
      tags: person.tags ?? [],
      identityStatus: person.identityStatus,
      lastInteractionAt: person.lastInteractionAt,
    };
  }

  private toHsakaaProfile(person: MemoryPerson & { _id: Types.ObjectId }) {
    return {
      ...this.toHsakaaSummary(person),
      emails: person.emails ?? [],
      phoneNumbers: person.phoneNumbers ?? [],
      contactReferences: person.contactReferences ?? [],
      firstMetAt: person.firstMetAt,
      notes: person.notes,
      memoryAccessConsentGranted: Boolean(person.memoryAccessConsentGranted),
    };
  }

  private normalizeTags(values?: string[]) {
    return [
      ...new Set(
        (values ?? [])
          .map((value) => value.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(Boolean),
      ),
    ];
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
