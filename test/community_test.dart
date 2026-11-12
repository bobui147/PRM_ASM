import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:prmgr5/models/community_post.dart';
import 'package:prmgr5/pages/community_page.dart';
import 'package:prmgr5/pages/community_post_form.dart';
import 'package:prmgr5/services/api_client.dart';
import 'package:prmgr5/services/app_services.dart';

void main() {
  test('bài cộng đồng đọc được ảnh và lý do kiểm duyệt', () {
    final p = CommunityPost.fromJson({'id': 1, 'author': {'id': 2,'displayName':'Lan'},'content':'Phở ngon','status':'rejected','moderationNote':'Ảnh không phù hợp','images':[{'id':3,'url':'https://example.com/a.webp'}]});
    expect(p.authorName,'Lan'); expect(p.images.single.id,3); expect(p.moderationNote,'Ảnh không phù hợp');
  });
  testWidgets('bảng tin hiển thị bài và thử lại khi lỗi', (tester) async {
    var fail = true;
    final api=ApiClient(httpClient:MockClient((req) async => fail ? http.Response(jsonEncode({'error':{'code':'ERROR','message':'Lỗi mạng thử nghiệm'}}),503) : http.Response(jsonEncode({'items':[{'id':1,'author':{'id':2,'displayName':'Lan'},'content':'Phở ngon','status':'published'}],'hasMore':false}),200)));
    final services=AppServices.inMemory(api:api); addTearDown(services.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityPage(services:services))); await tester.pumpAndSettle();
    expect(find.text('Lỗi mạng thử nghiệm'),findsOneWidget);
    fail=false; await tester.tap(find.text('Thử lại')); await tester.pumpAndSettle();
    expect(find.text('Phở ngon'),findsOneWidget);
  });
  testWidgets('form không gửi bài rỗng và giữ nội dung khi lỗi', (tester) async {
    final services=AppServices.inMemory(api:ApiClient(httpClient:MockClient((_)async=>http.Response('{}',500))));addTearDown(services.dispose);
    await tester.pumpWidget(MaterialApp(home:CommunityPostForm(services:services)));
    await tester.tap(find.text('Gửi để duyệt'));await tester.pump();
    expect(find.text('Nhập nội dung hoặc thêm ảnh'),findsOneWidget);
    await tester.enterText(find.byType(TextField).first,'Bữa trưa của tôi');
    await tester.tap(find.text('Gửi để duyệt'));await tester.pumpAndSettle();
    await tester.tap(find.text('Đã hiểu'));await tester.pumpAndSettle();
    expect(find.text('Bữa trưa của tôi'),findsOneWidget);
    expect(find.textContaining('Máy chủ'),findsOneWidget);
  });
}
