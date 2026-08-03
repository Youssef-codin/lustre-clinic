import { publicProcedure, router } from '../../trpc/init.ts';
import {
    createCustomQuestionInput,
    listCustomQuestionInput,
    updateCustomQuestionInput,
} from './customQuestion.schema.ts';
import { customQuestionService } from './customQuestion.service.ts';

export const customQuestionRouter = router({
    list: publicProcedure
        .input(listCustomQuestionInput)
        .query(({ input }) => customQuestionService.list(input)),

    create: publicProcedure
        .input(createCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.create(input)),

    update: publicProcedure
        .input(updateCustomQuestionInput)
        .mutation(({ input }) => customQuestionService.update(input)),
});
