import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/json_read.dart';
import '../services/app_services.dart';
import '../services/share_launcher.dart';
import '../widgets/common.dart';

String groupStatus(String value) => switch(value) {'choosing'=>'Đang chọn món','voting'=>'Đang bỏ phiếu','decided'=>'Đã chốt','ended'=>'Đã kết thúc',_=>value};

class GroupRoomsPage extends StatefulWidget {
  const GroupRoomsPage({super.key,required this.services});
  final AppServices services;
  @override
  State<GroupRoomsPage> createState()=>_GroupRoomsState();
}
class _GroupRoomsState extends State<GroupRoomsPage> {
  List<Map> _rooms=[];
  String? _error;
  bool _busy=false,_more=true;
  int _page=1;
  @override
  void initState(){super.initState();_load();}
  Future<void> _load({bool reset=false}) async {
    if(_busy)return;
    if(reset){_page=1;_rooms=[];_more=true;}
    setState((){_busy=true;_error=null;});
    try { final json=(await widget.services.communityApi.get('/groups',query:{'page':_page})).json;
      if(!mounted)return;_rooms.addAll(readMaps(json['items']));_more=json['hasMore']==true;_page++;
    }catch(e){if(mounted)_error=errorText(e);}
    if(mounted)setState(()=>_busy=false);
  }
  Future<void> _open(int id) async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>GroupRoomPage(services:widget.services,id:id)));
    if(mounted)await _load(reset:true);
  }
  Future<void> _join() async {
    final text=TextEditingController();
    final code=await showDialog<String>(context:context,builder:(c)=>AlertDialog(title:const Text('Tham gia phòng'),content:TextField(controller:text,maxLength:16,decoration:const InputDecoration(labelText:'Mã phòng')),actions:[TextButton(onPressed:()=>Navigator.pop(c),child:const Text('Hủy')),FilledButton(onPressed:()=>Navigator.pop(c,text.text.trim()),child:const Text('Tham gia'))]));
    // Controller được giải phóng sau khi route đã hoàn tất animation đóng.
    Future<void>.delayed(const Duration(milliseconds:350),text.dispose);
    if(code==null||_busy)return;
    setState(()=>_busy=true);
    try{final room=(await widget.services.communityApi.post('/groups/join',{'code':code})).json;if(mounted){setState(()=>_busy=false);await _open(readInt(room['id']));}}
    catch(e){if(mounted){setState(()=>_busy=false);showSnack(context,errorText(e));}}
  }
  Future<void> _create() async {
    final categories=widget.services.library.categories;
    if(categories.isEmpty){showSnack(context,'Chưa tải danh mục món');return;}
    var category=categories.first.id;int? budget=50000;
    final ok=await showDialog<bool>(context:context,builder:(c)=>StatefulBuilder(builder:(c,set)=>AlertDialog(title:const Text('Tạo phòng'),content:Column(mainAxisSize:MainAxisSize.min,children:[
      DropdownButtonFormField<int>(value:category,decoration:const InputDecoration(labelText:'Nhóm món'),items:[for(final cat in categories)DropdownMenuItem(value:cat.id,child:Text(cat.name))],onChanged:(v)=>set(()=>category=v!)),
      DropdownButtonFormField<int>(value:budget??0,decoration:const InputDecoration(labelText:'Ngân sách'),items:[for(final b in [50000,100000,150000,0])DropdownMenuItem(value:b,child:Text(b==0?'Không giới hạn':'$b đ'))],onChanged:(v)=>set(()=>budget=v==0?null:v)),
    ]),actions:[TextButton(onPressed:()=>Navigator.pop(c),child:const Text('Hủy')),FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Tạo'))])));
    if(ok!=true||_busy)return;setState(()=>_busy=true);
    try{final room=(await widget.services.communityApi.post('/groups',{'categoryId':category,'budget':budget})).json;if(mounted){setState(()=>_busy=false);await _open(readInt(room['id']));}}
    catch(e){if(mounted){setState(()=>_busy=false);showSnack(context,errorText(e));}}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Chọn món cùng nhóm')),body:ListView(padding:const EdgeInsets.all(16),children:[
    Wrap(spacing:12,children:[FilledButton(onPressed:_busy?null:_create,child:const Text('Tạo phòng')),OutlinedButton(onPressed:_busy?null:_join,child:const Text('Nhập mã phòng'))]),
    for(final room in _rooms)ListTile(title:Text('${room['code']}'),subtitle:Text(groupStatus('${room['status']}')),onTap:()=>_open(readInt(room['id']))),
    if(_error!=null)ErrorRetry(message:_error!,onRetry:_load),if(_busy)const Center(child:CircularProgressIndicator()),
    if(!_busy&&_more)TextButton(onPressed:_load,child:const Text('Xem thêm phòng')),
  ]));
}

class GroupRoomPage extends StatefulWidget{
  const GroupRoomPage({super.key,required this.services,required this.id});
  final AppServices services;final int id;
  @override
  State<GroupRoomPage> createState()=>_GroupRoomState();
}
class _GroupRoomState extends State<GroupRoomPage> with WidgetsBindingObserver {
  Map? _room;Timer? _timer;bool _loading=false,_acting=false;String? _error;int _version=0;
  String get path=>'/groups/${widget.id}';
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);_load();_startTimer();}
  void _startTimer(){_timer?.cancel();_timer=Timer.periodic(const Duration(seconds:3),(_)=>_load());}
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed){_load();_startTimer();}else{_timer?.cancel();}}
  @override
  void dispose(){_timer?.cancel();WidgetsBinding.instance.removeObserver(this);super.dispose();}
  Future<void> _load()async{
    if(_loading||_acting)return;_loading=true;final version=_version;
    try{final r=(await widget.services.communityApi.get(path)).json;if(mounted&&version==_version)setState((){_room=r;_error=null;});}
    catch(e){if(mounted)setState(()=>_error=errorText(e));}
    _loading=false;
  }
  Future<void> _act(String action,[Map<String,Object?> data=const {}])async{
    if(_acting)return;_version++;setState(()=>_acting=true);
    try{final r=await widget.services.communityApi.post('$path/action',{'action':action,...data});
      if(mounted){if(action=='leave'){Navigator.pop(context);}else{setState((){_room=r.json;_error=null;});}}}
    catch(e){if(mounted)showSnack(context,errorText(e));}
    if(mounted)setState(()=>_acting=false);
  }
  @override
  Widget build(BuildContext context){
    final room=_room;final user=widget.services.auth.user?.id;final host=room?['hostId']==user;final status=room?['status'];
    return Scaffold(appBar:AppBar(title:const Text('Phòng chọn món')),body:room==null?(_error==null?const Center(child:CircularProgressIndicator()):ErrorRetry(message:_error!,onRetry:_load)):ListView(padding:const EdgeInsets.all(16),children:[
      Text('Mã phòng: ${room['code']}'),Text(groupStatus('$status')),Text('Hết hạn: ${room['expiresAt']}'),
      Wrap(spacing:8,children:[TextButton(onPressed:()async{await Clipboard.setData(ClipboardData(text:'${room['code']}'));if(context.mounted)showSnack(context,'Đã sao chép mã');},child:const Text('Sao chép mã')),
        TextButton(onPressed:()async{final shared=await shareText('Cùng chọn món! Mã phòng: ${room['code']}');if(!shared&&context.mounted)showSnack(context,'Hãy sao chép mã để chia sẻ');},child:const Text('Chia sẻ'))]),
      Text('Thành viên: ${readMaps(room['members']).map((m)=>m['displayName']).join(', ')}'),
      if(room['result'] is Map)Text('Kết quả: ${(room['result'] as Map)['name']}',style:Theme.of(context).textTheme.headlineSmall),
      if(_error!=null)ErrorRetry(message:_error!,onRetry:_load),
      if(host&&status!='ended'&&status!='decided')Wrap(spacing:8,children:[
        if(status=='choosing')...[
          FilledButton(onPressed:_acting?null:()=>_act('startVote'),child:const Text('Bắt đầu bỏ phiếu')),
          OutlinedButton(onPressed:_acting?null:()=>_act('spin'),child:const Text('Quay kết quả')),
          TextButton(onPressed:_acting?null:()async{
            final cats=widget.services.library.categories;
            final selected=await showModalBottomSheet<int>(context:context,builder:(c)=>SafeArea(child:ListView(shrinkWrap:true,children:[for(final cat in cats)ListTile(title:Text(cat.name),onTap:()=>Navigator.pop(c,cat.id))])));
            if(selected!=null)await _act('settings',{'categoryId':selected,'budget':room['budget']});
          },child:const Text('Đổi nhóm món')),
          PopupMenuButton<int>(tooltip:'Đổi ngân sách',enabled:!_acting,onSelected:(v)=>_act('settings',{'categoryId':room['categoryId'],'budget':v==0?null:v}),itemBuilder:(_)=>[for(final b in [50000,100000,150000,0])PopupMenuItem(value:b,child:Text(b==0?'Không giới hạn':'$b đ'))]),
        ],
        if(status=='voting')...[
          FilledButton(onPressed:_acting?null:()=>_act('finishVote'),child:const Text('Chốt phiếu')),
          TextButton(onPressed:_acting?null:()=>_act('reset'),child:const Text('Quay lại chọn món')),
        ],
      ]),
      for(final f in readMaps(room['candidates']))...[
        ListTile(title:Text('${f['name']}'),subtitle:Text('${f['price']} đ · ${f['selections']} chọn · ${f['exclusions']} loại · ${f['votes']} phiếu')),
        if(status=='choosing')Wrap(spacing:8,children:[for(final entry in {'select':'Chọn','exclude':'Loại','neutral':'Bỏ lựa chọn'}.entries)ChoiceChip(label:Text(entry.value),selected:readMaps(room['choices']).any((c)=>c['userId']==user&&c['candidateId']==f['id']&&c['choice']==entry.key),onSelected:_acting?null:(_)=>_act('choice',{'candidateId':f['id'],'choice':entry.key}))]),
        if(status=='voting'&&f['eligible']==true)RadioListTile<int>(value:readInt(f['id']),groupValue:readMaps(room['votes']).where((v)=>v['userId']==user).map((v)=>readInt(v['candidateId'])).firstOrNull,onChanged:_acting?null:(v)=>_act('vote',{'candidateId':v}),title:const Text('Bỏ phiếu món này')),
      ],
      if(status!='ended')TextButton(onPressed:_acting?null:()=>_act('leave'),child:Text(host?'Rời và kết thúc phòng':'Rời phòng')),
      if(host&&status!='ended')TextButton(onPressed:_acting?null:()=>_act('end'),child:const Text('Kết thúc phòng')),
    ]));
  }
}
