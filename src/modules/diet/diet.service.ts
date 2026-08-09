import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateDietEntryDto } from './dto/create-diet-entry.dto';
import { UpdateDietEntryDto } from './dto/update-diet-entry.dto';
import {
  DietEntry,
  DietEntryDocument,
  Meal,
  MealStatus,
  NutritionValues,
} from './schemas/diet-entry.schema';

@Injectable()
export class DietService {
  constructor(
    @InjectModel(DietEntry.name)
    private readonly dietEntryModel: Model<DietEntryDocument>,
  ) {}

  async create(dto: CreateDietEntryDto) {
    this.validateObjectId(dto.userId, 'user ID');

    const date = this.normalizeDate(dto.date);

    const exists = await this.dietEntryModel.exists({
      userId: new Types.ObjectId(dto.userId),
      date,
    });

    if (exists) {
      throw new ConflictException(
        'Diet entry already exists for this date.',
      );
    }

    const meals = this.prepareMeals(dto.meals || []);

    const totals = this.calculateTotals(meals);

    return this.dietEntryModel.create({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      date,
      meals,
      actuals: totals.actuals,
      adherence: this.calculateAdherence({
        targets: dto.targets,
        actuals: totals.actuals,
        meals,
      }),
    });
  }

  async findAll(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    this.validateObjectId(userId, 'user ID');

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isActive: true,
    };

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};

      if (startDate) {
        dateFilter.$gte = this.normalizeDate(startDate);
      }

      if (endDate) {
        const end = this.normalizeDate(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.date = dateFilter;
    }

    return this.dietEntryModel
      .find(filter)
      .sort({ date: -1 })
      .lean();
  }

  async findOne(dietEntryId: string, userId: string) {
    this.validateObjectId(dietEntryId, 'diet entry ID');
    this.validateObjectId(userId, 'user ID');

    const entry = await this.dietEntryModel
      .findOne({
        _id: new Types.ObjectId(dietEntryId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .lean();

    if (!entry) {
      throw new NotFoundException('Diet entry not found.');
    }

    return entry;
  }

  async update(
    dietEntryId: string,
    userId: string,
    dto: UpdateDietEntryDto,
  ) {
    this.validateObjectId(dietEntryId, 'diet entry ID');
    this.validateObjectId(userId, 'user ID');

    const existing = await this.dietEntryModel.findOne({
      _id: new Types.ObjectId(dietEntryId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!existing) {
      throw new NotFoundException('Diet entry not found.');
    }

    const meals = dto.meals
      ? this.prepareMeals(dto.meals)
      : existing.meals;

    const totals = this.calculateTotals(meals);

    const targets = dto.targets || existing.targets;

    const updated = await this.dietEntryModel
      .findByIdAndUpdate(
        existing._id,
        {
          $set: {
            ...dto,
            userId: existing.userId,
            date: dto.date
              ? this.normalizeDate(dto.date)
              : existing.date,
            meals,
            actuals: totals.actuals,
            adherence: this.calculateAdherence({
              targets,
              actuals: totals.actuals,
              meals,
            }),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    return updated;
  }

  async updateMealStatus(
    dietEntryId: string,
    userId: string,
    mealIndex: number,
    data: {
      status: MealStatus;
      consumedAt?: string;
      consumedItems?: Meal['consumedItems'];
      skipReason?: string;
      replacementReason?: string;
      notes?: string;
    },
  ) {
    this.validateObjectId(dietEntryId, 'diet entry ID');
    this.validateObjectId(userId, 'user ID');

    const entry = await this.dietEntryModel.findOne({
      _id: new Types.ObjectId(dietEntryId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!entry) {
      throw new NotFoundException('Diet entry not found.');
    }

    if (!entry.meals[mealIndex]) {
      throw new BadRequestException('Invalid meal index.');
    }

    entry.meals[mealIndex].status = data.status;

    if (data.consumedAt) {
      entry.meals[mealIndex].consumedAt =
        new Date(data.consumedAt);
    }

    if (data.consumedItems) {
      entry.meals[mealIndex].consumedItems =
        data.consumedItems;
    }

    if (data.skipReason !== undefined) {
      entry.meals[mealIndex].skipReason =
        data.skipReason;
    }

    if (data.replacementReason !== undefined) {
      entry.meals[mealIndex].replacementReason =
        data.replacementReason;
    }

    if (data.notes !== undefined) {
      entry.meals[mealIndex].notes = data.notes;
    }

    entry.meals[mealIndex].completionPercentage =
      this.getCompletionPercentage(data.status);

    entry.meals[mealIndex].actualNutrition =
      this.sumFoodItems(
        entry.meals[mealIndex].consumedItems || [],
      );

    const totals = this.calculateTotals(entry.meals);

    entry.actuals = totals.actuals;
    entry.adherence = this.calculateAdherence({
      targets: entry.targets,
      actuals: totals.actuals,
      meals: entry.meals,
    });

    await entry.save();

    return entry;
  }

  async remove(dietEntryId: string, userId: string) {
    this.validateObjectId(dietEntryId, 'diet entry ID');
    this.validateObjectId(userId, 'user ID');

    const entry = await this.dietEntryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(dietEntryId),
        userId: new Types.ObjectId(userId),
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
    );

    if (!entry) {
      throw new NotFoundException('Diet entry not found.');
    }

    return {
      message: 'Diet entry deleted successfully.',
    };
  }

  private prepareMeals(meals: any[]): Meal[] {
    return meals.map((meal) => ({
      ...meal,
      plannedAt: meal.plannedAt
        ? new Date(meal.plannedAt)
        : undefined,
      consumedAt: meal.consumedAt
        ? new Date(meal.consumedAt)
        : undefined,
      plannedNutrition: this.sumFoodItems(
        meal.plannedItems || [],
      ),
      actualNutrition: this.sumFoodItems(
        meal.consumedItems || [],
      ),
      completionPercentage:
        meal.completionPercentage ??
        this.getCompletionPercentage(
          meal.status || MealStatus.PLANNED,
        ),
    })) as Meal[];
  }

  private calculateTotals(meals: Meal[]) {
    const nutrition = this.emptyNutrition();

    let mealsCompleted = 0;
    let mealsSkipped = 0;

    for (const meal of meals) {
      const values =
        meal.actualNutrition ||
        this.sumFoodItems(meal.consumedItems || []);

      this.addNutrition(nutrition, values);

      if (meal.status === MealStatus.COMPLETED) {
        mealsCompleted += 1;
      }

      if (meal.status === MealStatus.SKIPPED) {
        mealsSkipped += 1;
      }
    }

    return {
      actuals: {
        nutrition,
        waterLitres: 0,
        mealsCompleted,
        mealsSkipped,
        fruitServings: 0,
        vegetableServings: 0,
        hadAlcohol: false,
        hadJunkFood: false,
        smoked: false,
      },
    };
  }

  private calculateAdherence(params: {
    targets: any;
    actuals: any;
    meals: Meal[];
  }) {
    const targetNutrition =
      params.targets?.nutrition || {};

    const actualNutrition =
      params.actuals?.nutrition || {};

    const calorieTargetPercentage =
      this.percentage(
        actualNutrition.calories,
        targetNutrition.calories,
      );

    const proteinTargetPercentage =
      this.percentage(
        actualNutrition.proteinGrams,
        targetNutrition.proteinGrams,
      );

    const hydrationTargetPercentage =
      this.percentage(
        params.actuals?.waterLitres,
        params.targets?.waterLitres,
      );

    const totalMeals = params.meals.length;

    const mealCompletion = params.meals.reduce(
      (total, meal) =>
        total + (meal.completionPercentage || 0),
      0,
    );

    const mealPlanCompletionPercentage = totalMeals
      ? Number((mealCompletion / totalMeals).toFixed(2))
      : 0;

    const validPercentages = [
      calorieTargetPercentage,
      proteinTargetPercentage,
      hydrationTargetPercentage,
      mealPlanCompletionPercentage,
    ].filter((value) => value > 0);

    const overallPercentage = validPercentages.length
      ? Number(
          (
            validPercentages.reduce(
              (sum, value) => sum + value,
              0,
            ) / validPercentages.length
          ).toFixed(2),
        )
      : 0;

    return {
      calorieTargetPercentage,
      proteinTargetPercentage,
      hydrationTargetPercentage,
      mealPlanCompletionPercentage,
      overallPercentage,
      followedMealPlan:
        mealPlanCompletionPercentage >= 90,
    };
  }

  private sumFoodItems(
    items: Array<{
      nutrition?: Partial<NutritionValues>;
    }>,
  ): NutritionValues {
    const total = this.emptyNutrition();

    for (const item of items) {
      this.addNutrition(total, item.nutrition || {});
    }

    return total;
  }

  private addNutrition(
    total: NutritionValues,
    value: Partial<NutritionValues>,
  ) {
    total.calories += value.calories || 0;
    total.proteinGrams += value.proteinGrams || 0;
    total.carbohydratesGrams +=
      value.carbohydratesGrams || 0;
    total.fatGrams += value.fatGrams || 0;
    total.fibreGrams += value.fibreGrams || 0;
    total.sugarGrams += value.sugarGrams || 0;
    total.sodiumMg += value.sodiumMg || 0;
  }

  private emptyNutrition(): NutritionValues {
    return {
      calories: 0,
      proteinGrams: 0,
      carbohydratesGrams: 0,
      fatGrams: 0,
      fibreGrams: 0,
      sugarGrams: 0,
      sodiumMg: 0,
    };
  }

  private percentage(
    actual?: number,
    target?: number,
  ): number {
    if (!target || target <= 0) {
      return 0;
    }

    return Number(
      Math.min((Number(actual || 0) / target) * 100, 100)
        .toFixed(2),
    );
  }

  private getCompletionPercentage(
    status: MealStatus,
  ): number {
    switch (status) {
      case MealStatus.COMPLETED:
        return 100;

      case MealStatus.PARTIAL:
        return 50;

      case MealStatus.REPLACED:
        return 100;

      case MealStatus.SKIPPED:
      case MealStatus.PLANNED:
      default:
        return 0;
    }
  }

  private normalizeDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    date.setHours(0, 0, 0, 0);

    return date;
  }

  private validateObjectId(
    value: string,
    fieldName: string,
  ) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }
  }
}