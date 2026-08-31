import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';

import { AddCompanyGoalDto } from './dto/add-company-goal.dto';
import { AddCompanyMetricDto } from './dto/add-company-metric.dto';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyGoalDto } from './dto/update-company-goal.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
  ) {}

  async create(dto: CreateCompanyDto) {
    const slug = this.generateSlug(dto.slug || dto.name);

    const existing = await this.companyModel.exists({
      slug,
      isActive: true,
    });

    if (existing) {
      throw new ConflictException('A company with this slug already exists.');
    }

    const company = await this.companyModel.create({
      ...dto,
      slug,
      foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : undefined,
      lastReviewedAt: dto.lastReviewedAt
        ? new Date(dto.lastReviewedAt)
        : undefined,
      metrics: this.prepareMetrics(dto.metrics),
      goals: this.prepareGoals(dto.goals),
    });

    return company;
  }

  async findAll(query: CompanyQueryDto) {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 20, 1), 100);

    const filter: QueryFilter<CompanyDocument> = {
      isActive: true,
    };

    if (query.companyId) {
      this.validateObjectId(query.companyId, 'company ID');

      filter._id = new Types.ObjectId(query.companyId);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.stage) {
      filter.stage = query.stage;
    }

    if (query.industry) {
      filter.industries = {
        $regex: this.escapeRegex(query.industry),
        $options: 'i',
      };
    }

    if (query.market) {
      filter.markets = {
        $regex: this.escapeRegex(query.market),
        $options: 'i',
      };
    }

    if (query.isFeatured !== undefined) {
      filter.isFeatured = query.isFeatured;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.companyModel
        .find(filter)
        .sort({
          isFeatured: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.companyModel.countDocuments(filter),
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

  async findPublic(query: CompanyQueryDto) {
    const result = await this.findAll({
      ...query,
      isArchived: false,
    });

    return {
      ...result,
      data: result.data.map((company) => {
        const { metadata, ...publicCompany } = company;
        return publicCompany;
      }),
    };
  }

  async findPublicBySlug(slug: string) {
    const company = await this.companyModel
      .findOne({
        slug: this.generateSlug(slug),
        isActive: true,
        isArchived: false,
      })
      .select({
        metadata: 0,
      })
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async findOne(companyId: string) {
    this.validateObjectId(companyId, 'company ID');

    const company = await this.companyModel
      .findOne({
        _id: new Types.ObjectId(companyId),
        isActive: true,
      })
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async findBySlug(slug: string) {
    const company = await this.companyModel
      .findOne({
        slug: this.generateSlug(slug),
        isActive: true,
      })
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    this.validateObjectId(companyId, 'company ID');

    const existing = await this.companyModel.findOne({
      _id: new Types.ObjectId(companyId),
      isActive: true,
    });

    if (!existing) {
      throw new NotFoundException('Company not found.');
    }

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    if (dto.slug || dto.name) {
      const nextSlug = this.generateSlug(dto.slug || dto.name || existing.name);

      const duplicate = await this.companyModel.exists({
        _id: {
          $ne: existing._id,
        },
        slug: nextSlug,
        isActive: true,
      });

      if (duplicate) {
        throw new ConflictException('A company with this slug already exists.');
      }

      updateData.slug = nextSlug;
    }

    if (dto.foundedAt !== undefined) {
      updateData.foundedAt = dto.foundedAt ? new Date(dto.foundedAt) : null;
    }

    if (dto.lastReviewedAt !== undefined) {
      updateData.lastReviewedAt = dto.lastReviewedAt
        ? new Date(dto.lastReviewedAt)
        : null;
    }

    if (dto.metrics !== undefined) {
      updateData.metrics = this.prepareMetrics(dto.metrics);
    }

    if (dto.goals !== undefined) {
      updateData.goals = this.prepareGoals(dto.goals);
    }

    const updated = await this.companyModel
      .findByIdAndUpdate(
        existing._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    return updated;
  }

  async addMetric(companyId: string, dto: AddCompanyMetricDto) {
    const company = await this.getCompanyDocument(companyId);

    const metricIndex = company.metrics.findIndex(
      (metric) => metric.key === dto.key,
    );

    const metric = {
      ...dto,
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
    };

    if (metricIndex >= 0) {
      company.metrics[metricIndex] = metric;
    } else {
      company.metrics.push(metric);
    }

    await company.save();

    return company;
  }

  async removeMetric(companyId: string, metricKey: string) {
    const company = await this.getCompanyDocument(companyId);

    const previousLength = company.metrics.length;

    company.metrics = company.metrics.filter(
      (metric) => metric.key !== metricKey,
    );

    if (company.metrics.length === previousLength) {
      throw new NotFoundException('Company metric not found.');
    }

    await company.save();

    return company;
  }

  async addGoal(companyId: string, dto: AddCompanyGoalDto) {
    const company = await this.getCompanyDocument(companyId);

    company.goals.push({
      ...dto,
      progressPercentage: dto.progressPercentage || 0,
      completed: dto.completed || false,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
    });

    await company.save();

    return company;
  }

  async updateGoal(
    companyId: string,
    goalIndex: number,
    dto: UpdateCompanyGoalDto,
  ) {
    const company = await this.getCompanyDocument(companyId);

    if (
      !Number.isInteger(goalIndex) ||
      goalIndex < 0 ||
      !company.goals[goalIndex]
    ) {
      throw new BadRequestException('Invalid company goal index.');
    }

    const currentGoal = company.goals[goalIndex];

    if (dto.title !== undefined) {
      currentGoal.title = dto.title;
    }

    if (dto.description !== undefined) {
      currentGoal.description = dto.description;
    }

    if (dto.progressPercentage !== undefined) {
      currentGoal.progressPercentage = dto.progressPercentage;
    }

    if (dto.targetDate !== undefined) {
      currentGoal.targetDate = dto.targetDate
        ? new Date(dto.targetDate)
        : undefined;
    }

    if (dto.completed !== undefined) {
      currentGoal.completed = dto.completed;

      if (dto.completed && dto.progressPercentage === undefined) {
        currentGoal.progressPercentage = 100;
      }
    }

    await company.save();

    return company;
  }

  async removeGoal(companyId: string, goalIndex: number) {
    const company = await this.getCompanyDocument(companyId);

    if (
      !Number.isInteger(goalIndex) ||
      goalIndex < 0 ||
      !company.goals[goalIndex]
    ) {
      throw new BadRequestException('Invalid company goal index.');
    }

    company.goals.splice(goalIndex, 1);

    await company.save();

    return company;
  }

  async updatePriorities(companyId: string, priorities: string[]) {
    const updated = await this.companyModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(companyId),
          isActive: true,
        },
        {
          $set: {
            currentPriorities: priorities,
            lastReviewedAt: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Company not found.');
    }

    return updated;
  }

  async archive(companyId: string) {
    this.validateObjectId(companyId, 'company ID');

    const company = await this.companyModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(companyId),
          isActive: true,
        },
        {
          $set: {
            isArchived: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async restore(companyId: string) {
    this.validateObjectId(companyId, 'company ID');

    const company = await this.companyModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(companyId),
          isActive: true,
        },
        {
          $set: {
            isArchived: false,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async remove(companyId: string) {
    this.validateObjectId(companyId, 'company ID');

    const company = await this.companyModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(companyId),
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            isArchived: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return {
      message: 'Company deleted successfully.',
    };
  }

  private async getCompanyDocument(
    companyId: string,
  ): Promise<CompanyDocument> {
    this.validateObjectId(companyId, 'company ID');

    const company = await this.companyModel.findOne({
      _id: new Types.ObjectId(companyId),
      isActive: true,
    });

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  private prepareMetrics(
    metrics:
      | Array<{
          key: string;
          label: string;
          value: string | number | boolean;
          unit?: string;
          measuredAt?: string;
        }>
      | undefined,
  ) {
    if (!metrics) {
      return [];
    }

    return metrics.map((metric) => ({
      ...metric,
      measuredAt: metric.measuredAt ? new Date(metric.measuredAt) : new Date(),
    }));
  }

  private prepareGoals(
    goals:
      | Array<{
          title: string;
          description?: string;
          progressPercentage?: number;
          targetDate?: string;
          completed?: boolean;
        }>
      | undefined,
  ) {
    if (!goals) {
      return [];
    }

    return goals.map((goal) => ({
      ...goal,
      progressPercentage: goal.progressPercentage || 0,
      completed: goal.completed || false,
      targetDate: goal.targetDate ? new Date(goal.targetDate) : undefined,
    }));
  }

  private generateSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException('Unable to generate a valid company slug.');
    }

    return slug;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
