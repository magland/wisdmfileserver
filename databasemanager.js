
var mongo=require('mongodb');

var m_databases={};

exports.DATABASE=function(name,port) {
	if (!port) port=27017;
	var code=name+'::'+port;
	if (!(code in m_databases)) {
		m_databases[code]=new DatabaseManager(name,port);
	}
	return m_databases[code];
};

function DatabaseManager(database_name,database_port) {
	
	this.setCollection=function(collection) {m_collection=collection;};
	this.find=function(query,fields,callback) {_find(query,fields,callback);};
	this.insert=function(doc,callback) {_insert(doc,callback);};
	this.save=function(doc,callback) {_save(doc,callback);};
	this.update=function(query,obj,callback) {_update(query,obj,callback);};
	this.upsert=function(query,obj,callback) {_upsert(query,obj,callback);};
	this.remove=function(selector,callback) {_remove(selector,callback);};
	
	var m_database=null;
	var m_collection='';
	var m_current_operations={};
	var m_last_operation_time=new Date();
	var m_last_open_time=new Date();
	var m_opening_database=false; //added on 6/16/14
	
	function _find(query,fields,callback) {
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.find(query,fields).toArray(function(err,docs) {
				callback(err,docs);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	function _insert(doc,callback) {
		if ((typeof(doc.length)!='undefined')&&(doc.length===0)) {
			callback('');
			return;
		}
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.insert(doc,function(err) {
				callback(err);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	function _save(doc,callback) {
		if ((typeof(doc.length)!='undefined')&&(doc.length===0)) {
			callback('');
			return;
		}
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.save(doc,function(err) {
				callback(err);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	function _update(query,obj,callback) {
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.update(query,obj,function(err) {
				callback(err);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	function _upsert(query,obj,callback) {
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.update(query,obj,{upsert:true},function(err) {
				callback(err);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	function _remove(selector,callback) {
		initialize_operation(function(tmp) {
			if (!tmp.success) {
				callback(tmp); return;
			}
			var CC=m_database.collection(m_collection);
			CC.remove(selector,function(err) {
				callback(err);
				finalize_operation(tmp.operation_id);
			});
		});
	}
	
	function make_random_id(numchars) {
		if (!numchars) numchars=10;
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for( var i=0; i < numchars; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));	
		return text;
	}
	
	
	function initialize_operation(callback) {
		open_database_if_needed(function(tmp1) {
			if (!tmp1.success) {
				callback(tmp1); return;
			}
			var operation_id=make_random_id();
			m_current_operations[operation_id]={time_started:new Date()};
			callback({success:true,operation_id:operation_id});
		});
	}
	function finalize_operation(operation_id) {
		m_last_operation_time=new Date();
		delete(m_current_operations[operation_id]);
	}
	function wait_until_done_opening_database(callback) {
		if (!m_opening_database) {
			callback();
			return;
		}
		setTimeout(function() {
			wait_until_done_opening_database(callback);
		},100);
	}
	function open_database_if_needed(callback) {
		if (m_opening_database) {
			wait_until_done_opening_database(function() {
				open_database_if_needed(callback);
				return;
			});
		}
		m_opening_database=true;
		if (m_database) {
			m_opening_database=false;
			callback({success:true});
			return;
		}
		m_database=new mongo.Db(database_name,new mongo.Server("localhost",database_port,{}),{safe:true});
		m_database.open(function(err,db) {
			if (err) {
				m_database=null;
				m_opening_database=false;
				callback({success:false,error:'Unable to open database: '+database_name+' '+err});
				return;
			}
			m_last_open_time=new Date();
			m_opening_database=false;
			callback({success:true});
		});
	}
	function periodic_check() {
		if (m_database) {
			var operation_count=0;
			for (var key in m_current_operations) operation_count++;
			if (operation_count===0) {
				var elapsed=((new Date())-m_last_operation_time);
				if (elapsed>5000) {
					var elapsed_from_open=((new Date())-m_last_open_time);
					console.log ('Closing database after '+elapsed_from_open+' ms.');
					m_database.close();
					m_database=null;
				}
			}
		}
		setTimeout(periodic_check,1000);
	}
	periodic_check();
}
