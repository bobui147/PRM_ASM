import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:prmgr5/home_shell.dart';
import 'package:prmgr5/models/community.dart';
import 'package:prmgr5/models/group_room.dart';
import 'package:prmgr5/models/meal_plan.dart';
import 'package:prmgr5/pages/auth_pages.dart';
import 'package:prmgr5/pages/community_page.dart';
import 'package:prmgr5/pages/group_room_page.dart';
import 'package:prmgr5/pages/meal_plan_page.dart';
import 'package:prmgr5/pages/post_form_page.dart';
import 'package:prmgr5/pages/profile_page.dart';
import 'package:prmgr5/services/api_client.dart';
import 'package:prmgr5/services/app_services.dart';
import 'package:prmgr5/services/auth_service.dart';
import 'package:prmgr5/services/catalog_repository.dart';
import 'package:prmgr5/services/community_repository.dart';
import 'package:prmgr5/services/food_library.dart';
import 'package:prmgr5/services/group_repository.dart';
import 'package:prmgr5/services/meal_plan_repository.dart';
import 'package:prmgr5/services/restaurant_repository.dart';

/// Server giả: mỗi request được ghi lại, [routes] trả JSON theo "METHOD /path".
class FakeServer {
  final List<http.Request> requests = [];
  final Map<String, Object? Function(http.Request)> routes = {};

  void on(String key, Object? Function(http.Request) handler) => routes[key] = handler;

  MockClient get client => MockClient((request) async {
        requests.add(request);
        final path = request.url.path.replaceFirst('/api/v1', '');
        final handler = routes['${request.method} $path'];
        if (handler == null) {
          return http.Response(
            jsonEncode({
              'error': {'code': 'NOT_FOUND', 'message': 'Không có route giả $path'}
            }),
            404,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }
        final result = handler(request);
        if (result is http.Response) return result;
        return http.Response.bytes(utf8.encode(jsonEncode(result)), 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });

  bool called(String method, String path) =>
      requests.any((r) => r.method == method && r.url.path.endsWith(path));
}

http.Response apiError(int status, String code, String message) => http.Response.bytes(
      utf8.encode(jsonEncode({
        'error': {'code': code, 'message': message}
      })),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

final _catalog = Catalog.fromJson({
  'version': '1',
  'categories': [
    {'id': 1, 'slug': 'mon-chinh', 'name': 'Món chính', 'icon': 'restaurant', 'usesMealPeriods': true},
  ],
  'foods': [
    {'id': 11, 'name': 'Bún chả', 'categorySlug': 'mon-chinh', 'referencePrice': 35000, 'mealPeriods': ['lunch']},
    {'id': 12, 'name': 'Phở bò', 'categorySlug': 'mon-chinh', 'referencePrice': 45000, 'mealPeriods': ['lunch']},
  ],
});

Map<String, Object?> postJson(int id, {String content = 'Ngon', bool mine = false, String? status}) => {
      'id': id,
      'author': {'id': mine ? 1 : 2, 'displayName': mine ? 'Tôi' : 'Bình'},
      'content': content,
      'food': null,
      'restaurant': null,
      'images': [],
      'likeCount': 0,
      'commentCount': 0,
      'likedByMe': false,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'edited': false,
      'isMine': mine,
      if (status != null) 'status': status,
    };

Map<String, Object?> page(List<Object?> items) =>
    {'items': items, 'page': 1, 'limit': 20, 'total': items.length, 'hasMore': false};

Future<AppServices> buildServices(FakeServer server, {bool signedIn = false}) async {
  final api = ApiClient(httpClient: server.client, baseUrl: 'http://test/api/v1');
  final store = MemoryTokenStore();
  final services = AppServices(
    library: FoodLibrary.inMemory(catalog: _catalog),
    auth: AuthService(api, store: store),
    restaurants: RestaurantRepository(api),
    community: CommunityRepository(api),
    groups: GroupRepository(api),
    mealPlans: MealPlanRepository(api),
  );
  if (signedIn) {
    server.on('GET /me', (_) => {'id': 1, 'email': 'a@test.vn', 'displayName': 'Tôi', 'blocked': null});
    await store.write('access', 'refresh');
    await services.auth.restore();
  }
  return services;
}

Widget app(Widget home) => MaterialApp(home: home);

void main() {
  testWidgets('thanh điều hướng 6 tab vừa màn hình 360×640, mở được tab mới', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final server = FakeServer()..on('GET /posts', (_) => page([]));
    final services = await buildServices(server);
    await tester.pumpWidget(app(HomeShell(services: services)));
    await tester.pump();
    await tester.tap(find.byKey(const Key('nav-community')));
    await tester.pumpAndSettle();
    expect(find.text('Cộng đồng ẩm thực'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nav-plan')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('plan-guest')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  group('P1 — cộng đồng', () {
    testWidgets('bảng tin hiển thị bài, nội dung script chỉ là văn bản', (tester) async {
      final server = FakeServer()
        ..on('GET /posts', (_) => page([postJson(1, content: '<script>alert(1)</script> ngon')]));
      final services = await buildServices(server);
      await tester.pumpWidget(app(CommunityPage(services: services)));
      await tester.pumpAndSettle();
      expect(find.text('<script>alert(1)</script> ngon'), findsOneWidget);
      expect(find.text('Bình'), findsOneWidget);
    });

    testWidgets('khách chọn Đang theo dõi thì được đưa tới đăng nhập', (tester) async {
      final server = FakeServer()..on('GET /posts', (_) => page([]));
      final services = await buildServices(server);
      await tester.pumpWidget(app(CommunityPage(services: services)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('paged-empty')), findsOneWidget);
      await tester.tap(find.text('Đang theo dõi'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginPage), findsOneWidget);
    });

    testWidgets('lỗi tải bảng tin hiện nút Thử lại và tải lại được', (tester) async {
      var fail = true;
      final server = FakeServer()
        ..on('GET /posts', (_) => fail ? apiError(500, 'INTERNAL_ERROR', 'Máy chủ lỗi') : page([postJson(5)]));
      final services = await buildServices(server);
      await tester.pumpWidget(app(CommunityPage(services: services)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('retry-button')), findsOneWidget);
      fail = false;
      await tester.tap(find.byKey(const Key('retry-button')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('post-5')), findsOneWidget);
    });

    testWidgets('thích bài gửi API và cập nhật số lượt thích', (tester) async {
      final server = FakeServer()
        ..on('GET /posts', (_) => page([postJson(7)]))
        ..on('POST /posts/7/like', (_) => {'liked': true, 'likeCount': 1});
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(CommunityPage(services: services)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('like-7')));
      await tester.pumpAndSettle();
      expect(server.called('POST', '/posts/7/like'), isTrue);
      expect(find.descendant(of: find.byKey(const ValueKey('like-7')), matching: find.text('1')), findsOneWidget);
    });

    testWidgets('form đăng bài: chặn bài rỗng, ảnh thứ tư và ảnh quá 5 MB; lỗi giữ nội dung', (tester) async {
      final server = FakeServer()
        ..on('POST /posts', (_) => apiError(429, 'RATE_LIMITED', 'Bạn đã đăng tối đa 10 bài trong 24 giờ'));
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(PostFormPage(services: services)));
      await tester.tap(find.byKey(const Key('post-submit')));
      await tester.pump();
      expect(find.text('Bài viết cần có nội dung hoặc ít nhất một ảnh.'), findsOneWidget);
      expect(server.called('POST', '/posts'), isFalse);

      final state = tester.state(find.byType(PostFormPage)) as dynamic;
      final small = base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');
      expect(state.addImageBytes('a.png', small), isTrue);
      expect(state.addImageBytes('b.png', Uint8List(5 * 1024 * 1024 + 1)), isFalse);
      expect(state.addImageBytes('b.png', small), isTrue);
      expect(state.addImageBytes('c.png', small), isTrue);
      expect(state.addImageBytes('d.png', small), isFalse);
      await tester.pump();
      expect(find.text('Ảnh (3/3)'), findsOneWidget);
      expect(find.byKey(const Key('post-add-image')), findsNothing);

      await tester.enterText(find.byKey(const Key('post-content')), 'Bún chả Hòa Lạc');
      await tester.tap(find.byKey(const Key('post-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('post-error')), findsOneWidget);
      expect(find.text('Bún chả Hòa Lạc'), findsOneWidget);
    });

    testWidgets('Bài của tôi hiển thị nhãn bài bị ẩn', (tester) async {
      final server = FakeServer()
        ..on('GET /me/posts', (_) => page([postJson(3, mine: true, status: 'hidden')]));
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(MyPostsPage(services: services)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('post-hidden-badge')), findsOneWidget);
    });

    testWidgets('hồ sơ công khai: theo dõi cập nhật số người theo dõi', (tester) async {
      final server = FakeServer()
        ..on('GET /users/2', (_) => {'id': 2, 'displayName': 'Bình', 'followerCount': 0, 'isFollowing': false})
        ..on('GET /users/2/posts', (_) => page([]))
        ..on('POST /users/2/follow', (_) => {'following': true, 'followerCount': 1});
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(ProfilePage(userId: 2, services: services)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('follow')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('unfollow')), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
    });

    test('Post.fromJson: món không còn công khai không có id', () {
      final post = Post.fromJson({
        ...postJson(1),
        'food': {'id': null, 'name': 'Cơm tấm'},
      });
      expect(post.food!.id, isNull);
      expect(post.food!.name, 'Cơm tấm');
    });
  });

  group('P2 — phòng nhóm', () {
    Map<String, Object?> roomJson({
      String phase = 'selecting',
      int version = 1,
      bool owner = true,
      String? myMark,
      Map<String, Object?>? result,
    }) =>
        {
          'id': 9,
          'code': 'ABCD2345',
          'phase': phase,
          'version': version,
          'isOwner': owner,
          'owner': {'id': 1, 'displayName': 'Tôi'},
          'maxMembers': 10,
          'filters': {'categorySlug': null, 'maxPrice': null},
          'members': [
            {'id': 1, 'displayName': 'Tôi', 'isOwner': true, 'hasVoted': false},
            {'id': 2, 'displayName': 'Bình', 'isOwner': false, 'hasVoted': false},
          ],
          'foods': [
            {'id': 11, 'name': 'Bún chả', 'referencePrice': 35000, 'picks': 0, 'excludes': myMark == 'exclude' ? 1 : 0, 'myMark': myMark, 'isCandidate': myMark != 'exclude'},
            {'id': 12, 'name': 'Phở bò', 'referencePrice': 45000, 'picks': 0, 'excludes': 0, 'myMark': null, 'isCandidate': true},
          ],
          'candidates': [],
          'myVote': null,
          'result': result,
        };

    testWidgets('loại món gửi API; polling nhận kết quả do máy khác chốt', (tester) async {
      var current = roomJson();
      final server = FakeServer()
        ..on('PUT /rooms/9/marks/11', (request) {
          expect(jsonDecode(request.body), {'mark': 'exclude'});
          current = roomJson(version: 2, myMark: 'exclude');
          return current;
        })
        ..on('GET /rooms/9', (request) {
          final known = request.url.queryParameters['version'];
          return known == '${current['version']}' ? {'changed': false, 'version': current['version']} : current;
        });
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(GroupRoomPage(
        services: services,
        initial: GroupRoom.fromJson(current),
        pollInterval: const Duration(milliseconds: 200),
      )));
      expect(find.text('ABCD2345'), findsOneWidget);
      expect(find.text('2 món ứng viên · Bấm 👍 để chọn, 🚫 để loại'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('exclude-11')));
      await tester.pump();
      await tester.pump();
      expect(find.text('1 món ứng viên · Bấm 👍 để chọn, 🚫 để loại'), findsOneWidget);

      // Máy khác chốt bằng quay: lần polling tiếp theo hiện kết quả.
      current = roomJson(version: 3, phase: 'finished', result: {'foodId': 12, 'name': 'Phở bò', 'method': 'spin'});
      await tester.pump(const Duration(milliseconds: 250));
      await tester.pump();
      expect(find.byKey(const Key('room-result')), findsOneWidget);
      expect(find.text('Phở bò'), findsWidgets);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('phòng bị chủ rời hiện thông báo kết thúc', (tester) async {
      final server = FakeServer();
      final services = await buildServices(server, signedIn: true);
      final closed = {...roomJson(phase: 'closed', owner: false), 'closedReason': 'owner_left'};
      await tester.pumpWidget(app(GroupRoomPage(services: services, initial: GroupRoom.fromJson(closed))));
      expect(find.byKey(const Key('room-closed')), findsOneWidget);
      expect(find.text('Chủ phòng đã rời nên phòng kết thúc.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('thành viên không phải chủ phòng không thấy nút bắt đầu', (tester) async {
      final services = await buildServices(FakeServer(), signedIn: true);
      await tester.pumpWidget(app(GroupRoomPage(services: services, initial: GroupRoom.fromJson(roomJson(owner: false)))));
      expect(find.byKey(const Key('room-start-spin')), findsNothing);
      expect(find.text('Chờ chủ phòng bắt đầu bỏ phiếu hoặc quay...'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('P3 — thực đơn', () {
    testWidgets('khách thấy lời mời đăng nhập', (tester) async {
      final services = await buildServices(FakeServer());
      await tester.pumpWidget(app(MealPlanPage(services: services)));
      expect(find.byKey(const Key('plan-guest')), findsOneWidget);
    });

    testWidgets('hiển thị món hôm nay, đánh dấu đã ăn cần xác nhận', (tester) async {
      final today = isoDate(DateTime.now());
      var eaten = false;
      Map<String, Object?> item() => {
            'id': 4,
            'food': {'id': 11, 'name': 'Bún chả', 'referencePrice': 35000},
            'available': true,
            'date': today,
            'meal': 'lunch',
            'eaten': eaten,
          };
      final server = FakeServer()
        ..on('GET /me/meal-plan', (_) => {'items': [item()]})
        ..on('PUT /me/meal-plan/4/eaten', (_) {
          eaten = true;
          return item();
        })
        ..on('GET /me/want-to-try', (_) => page([]))
        ..on('GET /me/eaten', (_) => page([]));
      final services = await buildServices(server, signedIn: true);
      await tester.pumpWidget(app(MealPlanPage(services: services)));
      await tester.pumpAndSettle();
      expect(find.text('Bún chả'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('plan-menu-4')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Đánh dấu đã ăn'));
      await tester.pumpAndSettle();
      // Hủy thì không gọi API.
      await tester.tap(find.text('Hủy'));
      await tester.pumpAndSettle();
      expect(server.called('PUT', '/me/meal-plan/4/eaten'), isFalse);

      await tester.tap(find.byKey(const ValueKey('plan-menu-4')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Đánh dấu đã ăn'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-eaten')));
      await tester.pumpAndSettle();
      expect(server.called('PUT', '/me/meal-plan/4/eaten'), isTrue);
      expect(find.textContaining('Đã ăn'), findsWidgets);
    });

    test('startOfWeek trả thứ Hai', () {
      final monday = startOfWeek(DateTime(2026, 11, 13)); // thứ Sáu
      expect(monday, DateTime(2026, 11, 9));
      expect(dayLabel(DateTime(2026, 11, 9)), 'T2 · 09/11');
    });
  });
}
