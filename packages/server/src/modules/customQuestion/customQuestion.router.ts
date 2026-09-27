import { clinicProcedure, router } from '../../trpc/init.ts';
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

    create: clinicProcedure
        .input(createCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.create(input)),

    update: clinicProcedure
        .input(updateCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.update(input)),

    reorder: clinicProcedure
        .input(reorderCustomQuestionsInput)
        .mutation(({ input }) => customQuestionService.reorder(input)),
});
