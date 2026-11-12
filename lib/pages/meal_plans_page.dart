import 'package:flutter/material.dart';
import '../models/json_read.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';
import 'community_page.dart' show confirmCommunityDelete;

const _meals={'breakfast':'Sáng','lunch':'Trưa','dinner':'Tối','other':'Bữa khác'};
String _iso(DateTime d)=>'${d.year.toString().padLeft(4,'0')}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
class MealPlansPage extends StatefulWidget{
  const MealPlansPage({super.key,required this.services});final AppServices services;
  @override
  State<MealPlansPage> createState()=>_MealPlansState();
}
class _MealPlansState extends State<MealPlansPage>{
  DateTime _day=DateTime.now();bool _week=false,_busy=false,_acting=false,_more=true;String _mode='calendar';String? _error;int _page=1;final _items=<Map>[];
  @override
  void initState(){super.initState();_load(reset:true);}
  Future<void> _load({bool reset=false})async{
    if(_busy)return;if(reset){_items.clear();_page=1;_more=true;}
    setState((){_busy=true;_error=null;});
    final from=_week?_day.subtract(Duration(days:_day.weekday-1)):_day;
    try{final json=(await widget.services.communityApi.get('/plans/${_mode=='calendar'?'entries':_mode}',query:{'page':_page,if(_mode=='calendar')...{'from':_iso(from),'to':_iso(_week?from.add(const Duration(days:6)):from)}})).json;
      if(!mounted)return;_items.addAll(readMaps(json['items']));_more=json['hasMore']==true;_page++;
    }catch(e){if(mounted)_error=errorText(e);}
    if(mounted)setState(()=>_busy=false);
  }
  Future<void> _act(Future<void> Function() work)async{
    if(_acting||_busy)return;setState(()=>_acting=true);
    try{await work();if(mounted)await _load(reset:true);}catch(e){if(mounted)showSnack(context,errorText(e));}
    if(mounted)setState(()=>_acting=false);
  }
  Future<DateTime?> _pickDate(DateTime initial)=>showDatePicker(context:context,initialDate:initial,firstDate:DateTime(2000),lastDate:DateTime(2100));
  Future<String?> _pickMeal()=>showModalBottomSheet<String>(context:context,builder:(c)=>SafeArea(child:ListView(shrinkWrap:true,children:[for(final m in _meals.entries)ListTile(title:Text(m.value),onTap:()=>Navigator.pop(c,m.key))])));
  Future<void> _add({int? foodId})async{
    var id=foodId;
    if(id==null){
      id=await showModalBottomSheet<int>(context:context,builder:(c)=>SafeArea(child:ListView(children:[for(final f in widget.services.library.allFoods)ListTile(title:Text(f.name),onTap:()=>Navigator.pop(c,int.parse(f.id)))])));
    }
    if(id==null||!mounted)return;
    if(_mode=='wishlist'&&foodId==null){await widget.services.communityApi.put('/plans/wishlist/$id');return;}
    final date=await _pickDate(_day);if(date==null||!mounted)return;
    final meal=await _pickMeal();if(meal==null)return;
    await widget.services.communityApi.post('/plans/entries',{'foodId':id,'date':_iso(date),'meal':meal});
  }
  Future<void> _move(Map item)async{
    final date=await _pickDate(DateTime.parse('${item['date']}'));if(date==null||!mounted)return;
    final meal=await _pickMeal();if(meal==null)return;
    await widget.services.communityApi.patch('/plans/entries/${item['id']}',{'date':_iso(date),'meal':meal});
  }
  @override
  Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Thực đơn của tôi'),actions:[IconButton(tooltip:_mode=='wishlist'?'Lưu món muốn thử':'Thêm món',onPressed:_acting||_busy||_mode=='history'?null:()=>_act(_add),icon:const Icon(Icons.add))]),body:ListView(padding:const EdgeInsets.all(16),children:[
    Wrap(spacing:8,children:[for(final entry in {'calendar':'Kế hoạch','wishlist':'Muốn thử','history':'Đã ăn'}.entries)ChoiceChip(label:Text(entry.value),selected:_mode==entry.key,onSelected:_busy||_acting?null:(_){_mode=entry.key;_load(reset:true);})]),
    if(_mode=='calendar')...[
      SwitchListTile(title:const Text('Xem cả tuần'),value:_week,onChanged:_busy||_acting?null:(v){_week=v;_load(reset:true);}),
      TextButton(onPressed:_busy||_acting?null:()async{final d=await _pickDate(_day);if(d!=null){_day=d;await _load(reset:true);}},child:Text('Ngày ${_iso(_day)}')),
    ],
    for(final item in _items)Card(child:Padding(padding:const EdgeInsets.all(8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text('${item['foodName']}',style:Theme.of(context).textTheme.titleMedium),
      if(_mode!='wishlist')Text('${item['date']} · ${_meals[item['meal']]}${item['referencePrice']==null?'':' · ${item['referencePrice']} đ'}'),
      Wrap(spacing:8,children:[
        if(_mode=='wishlist')...[
          if(item['active']==true)TextButton(onPressed:_acting||_busy?null:()=>_act(()=>_add(foodId:readInt(item['foodId']))),child:const Text('Thêm vào kế hoạch'))
          else const Text('Món không còn hoạt động'),
          TextButton(onPressed:_acting||_busy?null:()=>_act(()async{if(await confirmCommunityDelete(context))await widget.services.communityApi.delete('/plans/wishlist/${item['id']}');}),child:const Text('Bỏ lưu')),
        ]else...[
          TextButton(onPressed:_acting||_busy?null:()=>_act(()async{await widget.services.communityApi.patch('/plans/entries/${item['id']}',{'eaten':_mode=='history'?false:item['eaten']!=true});}),child:Text(_mode=='history'||item['eaten']==true?'Hoàn tác đã ăn':'Đánh dấu đã ăn')),
          TextButton(onPressed:_acting||_busy?null:()=>_act(()=>_move(item)),child:const Text('Chuyển ngày/bữa')),
          TextButton(onPressed:_acting||_busy?null:()=>_act(()async{if(await confirmCommunityDelete(context))await widget.services.communityApi.delete('/plans/entries/${item['id']}');}),child:const Text('Xóa')),
        ],
      ]),
    ]))),
    if(_error!=null)ErrorRetry(message:_error!,onRetry:_load)
    else if(_busy)const Center(child:CircularProgressIndicator())
    else if(_items.isEmpty)const EmptyState(message:'Chưa có món trong danh sách.'),
    if(_more&&!_busy)TextButton(onPressed:_load,child:const Text('Xem thêm')),
  ]));
}
