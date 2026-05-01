import { RegisterUserUseCase } from "./register-user.use-case";
import { User } from "@domain/entities/user.entity";
import { AuthorizationError, DuplicateResourceError } from "@application/errors";

const makeUseCase = ({
  hasManager = false,
  existingUser = null,
}: { hasManager?: boolean; existingUser?: User | null } = {}) => {
  const userRepository = {
    findByEmail: jest.fn().mockResolvedValue(existingUser),
    hasAnyManager: jest.fn().mockResolvedValue(hasManager),
    save: jest.fn().mockImplementation((u: User) => Promise.resolve(u)),
  };
  return { useCase: new RegisterUserUseCase(userRepository as any), userRepository };
};

describe("RegisterUserUseCase", () => {
  it("deve criar o primeiro usuário como manager automaticamente", async () => {
    const { useCase, userRepository } = makeUseCase({ hasManager: false });

    const result = await useCase.execute("admin@motiva.app", "Admin", "senha123", null);

    expect(result).toHaveProperty("id");
    const savedUser: User = userRepository.save.mock.calls[0][0];
    expect(savedUser.role).toBe("manager");
  });

  it("deve lançar AuthorizationError quando não-manager tenta registrar novo usuário", async () => {
    const { useCase } = makeUseCase({ hasManager: true });

    await expect(useCase.execute("field@motiva.app", "Field", "senha123", "field")).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("deve lançar DuplicateResourceError quando o e-mail já está cadastrado", async () => {
    const existing = new User("u-1", "dup@motiva.app", "Dup", "hash", "field");
    const { useCase } = makeUseCase({ hasManager: true, existingUser: existing });

    await expect(useCase.execute("dup@motiva.app", "Dup", "senha123", "manager")).rejects.toThrow(
      DuplicateResourceError,
    );
  });
});
