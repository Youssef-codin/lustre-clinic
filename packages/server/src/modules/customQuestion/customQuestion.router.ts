import { clinicProcedure, router, setupProcedure } from '../../trpc/init.ts';
import {
    createCustomQuestionInput,
    listCustomQuestionInput,
    reorderCustomQuestionsInput,
    updateCustomQuestionInput,
} from './customQuestion.schema.ts';
import { customQuestionService } from './customQuestion.service.ts';

export const customQuestionRouter = router({
    list: clinicProcedure
        .input(listCustomQuestionInput)
        .query(({ input }) => customQuestionService.list(input)),

    create: setupProcedure
        .input(createCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.create(input)),

    update: setupProcedure
        .input(updateCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.update(input)),

    reorder: setupProcedure
        .input(reorderCustomQuestionsInput)
        .mutation(({ input }) => customQuestionService.reorder(input)),
});
