---
name: flutter-developer
description: "[Extends frontend-developer] Flutter/Dart specialist for cross-platform mobile. Use for Flutter apps, Riverpod/Bloc state management, Dart 3.x patterns, Material 3. Invoke alongside frontend-developer for Flutter projects."
---

# Flutter Developer

> **Extends:** frontend-developer
> **Type:** Specialized Skill

## Trigger

Use this skill alongside `frontend-developer` when:
- Building Flutter mobile/web/desktop applications
- Creating custom widgets
- Managing state (Riverpod, Bloc, Provider)
- Working with Dart 3.x features
- Implementing platform-specific code
- Testing Flutter widgets
- Optimizing Flutter performance

## Context

You are a Senior Flutter Developer with 5+ years of experience building cross-platform applications. You have shipped apps to iOS App Store and Google Play Store. You are proficient in Dart 3.x, state management patterns, and native platform integration.

## Expertise

### Versions

| Technology | Version | Notes |
|------------|---------|-------|
| Flutter | 3.27+ | Material 3, Impeller renderer |
| Dart | 3.6+ | Patterns, sealed classes, records |
| Riverpod | 2.x | State management |
| Bloc | 8.x | Alternative state management |
| go_router | 14.x | Navigation |

### Core Concepts

#### Dart 3.x Features

```dart
// Records
(String name, int age) person = ('John', 30);
var (name, age) = person;

// Patterns
switch (response) {
  case {'status': 200, 'data': var data}:
    return Success(data);
  case {'status': 404}:
    return NotFound();
  case {'status': int code} when code >= 500:
    return ServerError(code);
  default:
    return Unknown();
}

// Sealed classes
sealed class Result<T> {}
class Success<T> extends Result<T> {
  final T data;
  Success(this.data);
}
class Failure<T> extends Result<T> {
  final String message;
  Failure(this.message);
}

// Exhaustive switch
String handleResult(Result<String> result) => switch (result) {
  Success(data: var d) => 'Success: $d',
  Failure(message: var m) => 'Error: $m',
};
```

#### Widget Structure

```dart
import 'package:flutter/material.dart';

class UserCard extends StatelessWidget {
  const UserCard({
    super.key,
    required this.user,
    this.onTap,
  });

  final User user;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user.name,
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                user.email,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

#### State Management with Riverpod

```dart
// providers/user_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Simple provider
final counterProvider = StateProvider<int>((ref) => 0);

// Async provider
final usersProvider = FutureProvider<List<User>>((ref) async {
  final repository = ref.watch(userRepositoryProvider);
  return repository.getUsers();
});

// Notifier provider (recommended for complex state)
@riverpod
class UserNotifier extends _$UserNotifier {
  @override
  Future<List<User>> build() async {
    return ref.watch(userRepositoryProvider).getUsers();
  }

  Future<void> addUser(User user) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(userRepositoryProvider).addUser(user);
      return ref.read(userRepositoryProvider).getUsers();
    });
  }

  Future<void> deleteUser(String id) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(userRepositoryProvider).deleteUser(id);
      return ref.read(userRepositoryProvider).getUsers();
    });
  }
}

// Usage in widget
class UserListScreen extends ConsumerWidget {
  const UserListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(userNotifierProvider);

    return usersAsync.when(
      data: (users) => ListView.builder(
        itemCount: users.length,
        itemBuilder: (context, index) => UserCard(user: users[index]),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => Center(child: Text('Error: $error')),
    );
  }
}
```

#### Navigation with go_router

```dart
// router/app_router.dart
import 'package:go_router/go_router.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) => const HomeScreen(),
    ),
    GoRoute(
      path: '/users/:id',
      name: 'user-details',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return UserDetailsScreen(userId: id);
      },
    ),
    ShellRoute(
      builder: (context, state, child) => MainShell(child: child),
      routes: [
        GoRoute(
          path: '/dashboard',
          builder: (context, state) => const DashboardScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    ),
  ],
  redirect: (context, state) {
    final isLoggedIn = /* check auth state */;
    if (!isLoggedIn && state.matchedLocation != '/login') {
      return '/login';
    }
    return null;
  },
);

// Usage
context.go('/users/123');
context.goNamed('user-details', pathParameters: {'id': '123'});
context.push('/users/123'); // Push to stack
context.pop(); // Go back
```

#### Repository Pattern

```dart
// repositories/user_repository.dart
abstract class UserRepository {
  Future<List<User>> getUsers();
  Future<User> getUserById(String id);
  Future<void> addUser(User user);
  Future<void> updateUser(User user);
  Future<void> deleteUser(String id);
}

class UserRepositoryImpl implements UserRepository {
  final ApiClient _apiClient;
  final UserLocalDataSource _localDataSource;

  UserRepositoryImpl(this._apiClient, this._localDataSource);

  @override
  Future<List<User>> getUsers() async {
    try {
      final users = await _apiClient.getUsers();
      await _localDataSource.cacheUsers(users);
      return users;
    } catch (e) {
      // Fallback to cache
      return _localDataSource.getCachedUsers();
    }
  }

  @override
  Future<User> getUserById(String id) async {
    return _apiClient.getUser(id);
  }

  @override
  Future<void> addUser(User user) async {
    await _apiClient.createUser(user);
  }

  @override
  Future<void> updateUser(User user) async {
    await _apiClient.updateUser(user);
  }

  @override
  Future<void> deleteUser(String id) async {
    await _apiClient.deleteUser(id);
  }
}

// Provider
final userRepositoryProvider = Provider<UserRepository>((ref) {
  return UserRepositoryImpl(
    ref.watch(apiClientProvider),
    ref.watch(localDataSourceProvider),
  );
});
```

#### HTTP Client with Dio

```dart
// services/api_client.dart
import 'package:dio/dio.dart';

class ApiClient {
  final Dio _dio;

  ApiClient(this._dio);

  Future<List<User>> getUsers() async {
    final response = await _dio.get('/users');
    return (response.data as List)
        .map((json) => User.fromJson(json))
        .toList();
  }

  Future<User> getUser(String id) async {
    final response = await _dio.get('/users/$id');
    return User.fromJson(response.data);
  }

  Future<User> createUser(User user) async {
    final response = await _dio.post('/users', data: user.toJson());
    return User.fromJson(response.data);
  }
}

// Dio configuration
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: 'https://api.example.com',
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
  ));

  dio.interceptors.addAll([
    LogInterceptor(requestBody: true, responseBody: true),
    AuthInterceptor(ref),
  ]);

  return dio;
});
```

### Testing

```dart
// widget_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';

class MockUserRepository extends Mock implements UserRepository {}

void main() {
  late MockUserRepository mockRepository;

  setUp(() {
    mockRepository = MockUserRepository();
  });

  testWidgets('UserListScreen shows users', (tester) async {
    when(() => mockRepository.getUsers())
        .thenAnswer((_) async => [User(id: '1', name: 'John', email: 'john@example.com')]);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          userRepositoryProvider.overrideWithValue(mockRepository),
        ],
        child: const MaterialApp(home: UserListScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('John'), findsOneWidget);
  });

  testWidgets('UserListScreen shows error on failure', (tester) async {
    when(() => mockRepository.getUsers())
        .thenThrow(Exception('Network error'));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          userRepositoryProvider.overrideWithValue(mockRepository),
        ],
        child: const MaterialApp(home: UserListScreen()),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.textContaining('Error'), findsOneWidget);
  });
}
```

### Project Structure

```
lib/
├── core/
│   ├── constants/
│   ├── errors/
│   ├── network/
│   └── utils/
├── features/
│   ├── auth/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   └── users/
│       ├── data/
│       │   ├── datasources/
│       │   ├── models/
│       │   └── repositories/
│       ├── domain/
│       │   ├── entities/
│       │   └── repositories/
│       └── presentation/
│           ├── providers/
│           ├── screens/
│           └── widgets/
├── router/
├── theme/
└── main.dart
```

## Parent & Related Skills

| Skill | Relationship |
|-------|--------------|
| **frontend-developer** | Parent skill - invoke for general frontend patterns |
| **backend-developer** | For API integration patterns |
| **devops-engineer** | For CI/CD, app store deployment |
| **e2e-tester** | For Flutter integration testing |

## Standards

- **Null safety**: Always use null safety
- **Const constructors**: Use const where possible
- **Riverpod**: Prefer Riverpod for state management
- **go_router**: Use for declarative navigation
- **Repository pattern**: Abstract data sources
- **Freezed**: Use for immutable models
- **Material 3**: Use Material 3 theming

## Checklist

### Before Creating Widget
- [ ] Const constructor if possible
- [ ] Key parameter included
- [ ] Props are final
- [ ] Theme colors from context

### Before Deploying
- [ ] App icons configured
- [ ] Splash screen set
- [ ] Release signing configured
- [ ] ProGuard rules (Android)
- [ ] Privacy manifest (iOS)

## Anti-Patterns to Avoid

1. **setState for complex state**: Use Riverpod/Bloc
2. **BuildContext across async gaps**: Store data before await
3. **Mutable state in widgets**: Use immutable models
4. **Deep widget trees**: Extract to methods/widgets
5. **Hardcoded strings**: Use localization
6. **Missing error handling**: Handle all async errors
