import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:prmgr5/pages/group_rooms_page.dart';
import 'package:prmgr5/pages/meal_plans_page.dart';
import 'package:prmgr5/services/api_client.dart';
import 'package:prmgr5/services/app_services.dart';

void main(){
  testWidgets('phòng hiện snapshot, kết quả và không overflow màn hình nhỏ',(tester)async{
    tester.view.physicalSize=const Size(360,640);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final services=AppServices.inMemory(api:ApiClient(httpClient:MockClient((_)async=>http.Response(jsonEncode({
      'id':1,'code':'1234567890abcdef','hostId':2,'status':'decided','members':[{'id':2,'displayName':'Lan'}],
      'candidates':[{'id':3,'name':'Phở','price':50000,'selections':1,'exclusions':0,'votes':1}],
      'choices':[],'votes':[],'result':{'id':3,'name':'Phở'},
    }),200))));addTearDown(services.dispose);
    await tester.pumpWidget(MaterialApp(home:GroupRoomPage(services:services,id:1)));await tester.pumpAndSettle();
    expect(find.text('Kết quả: Phở'),findsOneWidget);expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('thực đơn gửi xác nhận đã ăn và hiển thị lỗi thử lại',(tester)async{
    var eaten=false;var fail=false;
    final services=AppServices.inMemory(api:ApiClient(httpClient:MockClient((req)async{
      if(req.method=='PATCH'){eaten=jsonDecode(req.body)['eaten']==true;return http.Response('',204);}
      if(fail)return http.Response(jsonEncode({'error':{'code':'ERROR','message':'Không tải được thực đơn'}}),500);
      return http.Response(jsonEncode({'items':[{'id':1,'foodName':'Phở','date':'2026-11-12','meal':'lunch','eaten':eaten,'referencePrice':50000}],'hasMore':false}),200);
    }))));addTearDown(services.dispose);
    await tester.pumpWidget(MaterialApp(home:MealPlansPage(services:services)));await tester.pumpAndSettle();
    await tester.tap(find.text('Đánh dấu đã ăn'));await tester.pumpAndSettle();
    expect(eaten,isTrue);expect(find.text('Hoàn tác đã ăn'),findsOneWidget);
    fail=true;await tester.tap(find.text('Muốn thử'));await tester.pumpAndSettle();
    expect(find.text('Không tải được thực đơn'),findsOneWidget);
  });
}
